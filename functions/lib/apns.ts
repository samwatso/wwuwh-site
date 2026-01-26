/**
 * Apple Push Notification Service (APNs) Client
 *
 * Sends push notifications to iOS devices using the APNs HTTP/2 API.
 * Uses JWT authentication with your APNs signing key.
 */

import { Env } from '../types'

// APNs endpoints
const APNS_PRODUCTION_HOST = 'https://api.push.apple.com'
const APNS_SANDBOX_HOST = 'https://api.sandbox.push.apple.com'

// Use production for now (sandbox is for development builds)
const APNS_HOST = APNS_PRODUCTION_HOST

interface APNsPayload {
  aps: {
    alert: {
      title: string
      body: string
      subtitle?: string
    }
    badge?: number
    sound?: string
    'thread-id'?: string
    'content-available'?: number
  }
  // Custom data
  [key: string]: unknown
}

interface SendNotificationResult {
  success: boolean
  deviceToken: string
  error?: string
  statusCode?: number
}

/**
 * Create a JWT token for APNs authentication
 */
async function createAPNsJWT(env: Env): Promise<string | null> {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY } = env

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.error('APNs: Missing required environment variables')
    return null
  }

  try {
    // Decode the base64-encoded private key
    const privateKeyPem = atob(APNS_PRIVATE_KEY)

    // Extract the key data from PEM format
    const pemHeader = '-----BEGIN PRIVATE KEY-----'
    const pemFooter = '-----END PRIVATE KEY-----'
    const pemContents = privateKeyPem
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '')

    const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

    // Import the private key for ES256 signing
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    )

    // Create JWT header and payload
    const header = {
      alg: 'ES256',
      kid: APNS_KEY_ID
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: APNS_TEAM_ID,
      iat: now
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
      { name: 'ECDSA', hash: 'SHA-256' },
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
    console.error('APNs: Failed to create JWT', error)
    return null
  }
}

/**
 * Send a push notification to a single device
 */
export async function sendPushNotification(
  env: Env,
  deviceToken: string,
  payload: APNsPayload
): Promise<SendNotificationResult> {
  const jwt = await createAPNsJWT(env)
  if (!jwt) {
    return {
      success: false,
      deviceToken,
      error: 'Failed to create APNs JWT'
    }
  }

  const bundleId = env.APNS_BUNDLE_ID || 'com.wwuwh.app'

  try {
    const response = await fetch(
      `${APNS_HOST}/3/device/${deviceToken}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `bearer ${jwt}`,
          'apns-topic': bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (response.ok) {
      return {
        success: true,
        deviceToken,
        statusCode: response.status
      }
    }

    // Handle APNs error responses
    const errorBody = await response.text()
    let errorReason = 'Unknown error'
    try {
      const errorJson = JSON.parse(errorBody)
      errorReason = errorJson.reason || errorReason
    } catch {
      errorReason = errorBody || errorReason
    }

    console.error(`APNs error for ${deviceToken}: ${response.status} - ${errorReason}`)

    return {
      success: false,
      deviceToken,
      error: errorReason,
      statusCode: response.status
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error'
    console.error(`APNs network error for ${deviceToken}:`, error)
    return {
      success: false,
      deviceToken,
      error: message
    }
  }
}

/**
 * Send notifications to multiple devices
 */
export async function sendPushNotifications(
  env: Env,
  deviceTokens: string[],
  payload: APNsPayload
): Promise<SendNotificationResult[]> {
  // Send in parallel (APNs supports high throughput)
  const results = await Promise.all(
    deviceTokens.map(token => sendPushNotification(env, token, payload))
  )

  return results
}

/**
 * Format event date/time for notification
 */
function formatEventDateTime(startsAtUtc: string, timezone: string): string {
  try {
    const date = new Date(startsAtUtc)

    // Format: "Tue 28 Jan, 7:30pm"
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone || 'Europe/London'
    }

    return date.toLocaleString('en-GB', options).replace(',', '')
  } catch {
    return ''
  }
}

/**
 * Send event invitation notifications
 */
export async function sendEventInvitationNotification(
  env: Env,
  db: D1Database,
  eventId: string,
  eventTitle: string,
  startsAtUtc: string,
  timezone: string,
  clubName: string,
  invitedPersonIds: string[]
): Promise<void> {
  // Get device tokens for invited people
  const placeholders = invitedPersonIds.map(() => '?').join(',')
  const tokens = await db
    .prepare(`
      SELECT token FROM device_tokens
      WHERE person_id IN (${placeholders})
    `)
    .bind(...invitedPersonIds)
    .all<{ token: string }>()

  if (!tokens.results?.length) {
    console.log('No device tokens found for invited people')
    return
  }

  const deviceTokens = tokens.results.map(t => t.token)

  // Format: "Training Session - Tue 28 Jan, 7:30pm"
  const dateTime = formatEventDateTime(startsAtUtc, timezone)
  const body = dateTime ? `${eventTitle} - ${dateTime}` : eventTitle

  const payload: APNsPayload = {
    aps: {
      alert: {
        title: clubName,
        body
      },
      sound: 'default',
      badge: 1
    },
    eventId
  }

  const results = await sendPushNotifications(env, deviceTokens, payload)

  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  console.log(`Event invitation notifications: ${successful} sent, ${failed} failed`)

  // Clean up invalid tokens (410 = token no longer valid)
  const invalidTokens = results
    .filter(r => r.statusCode === 410)
    .map(r => r.deviceToken)

  if (invalidTokens.length > 0) {
    const tokenPlaceholders = invalidTokens.map(() => '?').join(',')
    await db
      .prepare(`DELETE FROM device_tokens WHERE token IN (${tokenPlaceholders})`)
      .bind(...invalidTokens)
      .run()
    console.log(`Cleaned up ${invalidTokens.length} invalid device tokens`)
  }
}
