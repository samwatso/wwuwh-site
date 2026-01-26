/**
 * Firebase Cloud Messaging (FCM) Client
 *
 * Sends push notifications to Android devices using the FCM HTTP v1 API.
 * Uses service account JWT authentication.
 */

import { Env } from '../types'

// FCM endpoint
const FCM_HOST = 'https://fcm.googleapis.com/v1/projects'

interface FCMPayload {
  notification: {
    title: string
    body: string
  }
  data?: Record<string, string>
  android?: {
    priority?: 'normal' | 'high'
    notification?: {
      sound?: string
      click_action?: string
    }
  }
}

interface SendNotificationResult {
  success: boolean
  deviceToken: string
  error?: string
  statusCode?: number
}

/**
 * Create a JWT token for FCM authentication using service account
 */
async function createFCMJWT(env: Env): Promise<string | null> {
  const { FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY } = env

  if (!FCM_PROJECT_ID || !FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) {
    console.error('FCM: Missing required environment variables')
    return null
  }

  try {
    // Decode the base64-encoded private key
    const privateKeyPem = atob(FCM_PRIVATE_KEY)

    // Extract the key data from PEM format
    const pemHeader = '-----BEGIN PRIVATE KEY-----'
    const pemFooter = '-----END PRIVATE KEY-----'
    const pemContents = privateKeyPem
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '')

    const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

    // Import the private key for RS256 signing
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    )

    // Create JWT header and payload
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: FCM_CLIENT_EMAIL,
      sub: FCM_CLIENT_EMAIL,
      aud: 'https://fcm.googleapis.com/',
      iat: now,
      exp: now + 3600, // 1 hour expiry
      scope: 'https://www.googleapis.com/auth/firebase.messaging'
    }

    // Base64URL encode helper
    const base64UrlEncode = (data: string): string => {
      return btoa(data)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    }

    const headerB64 = base64UrlEncode(JSON.stringify(header))
    const payloadB64 = base64UrlEncode(JSON.stringify(payload))
    const signatureInput = `${headerB64}.${payloadB64}`

    // Sign the JWT
    const signature = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      new TextEncoder().encode(signatureInput)
    )

    // Convert signature to base64url
    const signatureBytes = new Uint8Array(signature)
    let binary = ''
    for (let i = 0; i < signatureBytes.length; i++) {
      binary += String.fromCharCode(signatureBytes[i])
    }
    const signatureB64 = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    return `${headerB64}.${payloadB64}.${signatureB64}`
  } catch (error) {
    console.error('FCM: Failed to create JWT', error)
    return null
  }
}

/**
 * Get OAuth2 access token from JWT
 */
async function getAccessToken(env: Env): Promise<string | null> {
  const jwt = await createFCMJWT(env)
  if (!jwt) return null

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    })

    if (!response.ok) {
      console.error('FCM: Failed to get access token', await response.text())
      return null
    }

    const data = await response.json() as { access_token: string }
    return data.access_token
  } catch (error) {
    console.error('FCM: Token exchange error', error)
    return null
  }
}

/**
 * Send a push notification to a single Android device
 */
export async function sendFCMNotification(
  env: Env,
  deviceToken: string,
  payload: FCMPayload
): Promise<SendNotificationResult> {
  const accessToken = await getAccessToken(env)
  if (!accessToken) {
    return {
      success: false,
      deviceToken,
      error: 'Failed to get FCM access token'
    }
  }

  const projectId = env.FCM_PROJECT_ID

  try {
    const response = await fetch(
      `${FCM_HOST}/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: payload.notification,
            data: payload.data,
            android: payload.android || {
              priority: 'high',
              notification: {
                sound: 'default'
              }
            }
          }
        })
      }
    )

    if (response.ok) {
      return {
        success: true,
        deviceToken,
        statusCode: response.status
      }
    }

    // Handle FCM error responses
    const errorBody = await response.text()
    let errorReason = 'Unknown error'
    try {
      const errorJson = JSON.parse(errorBody)
      errorReason = errorJson.error?.message || errorReason
    } catch {
      errorReason = errorBody || errorReason
    }

    console.error(`FCM error for ${deviceToken}: ${response.status} - ${errorReason}`)

    return {
      success: false,
      deviceToken,
      error: errorReason,
      statusCode: response.status
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    console.error(`FCM network error for ${deviceToken}:`, error)
    return {
      success: false,
      deviceToken,
      error: message
    }
  }
}

/**
 * Send notifications to multiple Android devices
 */
export async function sendFCMNotifications(
  env: Env,
  deviceTokens: string[],
  payload: FCMPayload
): Promise<SendNotificationResult[]> {
  // Send in parallel
  const results = await Promise.all(
    deviceTokens.map(token => sendFCMNotification(env, token, payload))
  )

  return results
}
