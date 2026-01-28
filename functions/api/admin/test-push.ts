/**
 * Test Push Notification Endpoint
 * POST /api/admin/test-push - Send a test push notification
 *
 * This endpoint verifies APNs configuration and sends a test notification.
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'
import { isAdmin } from '../../middleware/admin'

// APNs endpoints
const APNS_PRODUCTION_HOST = 'https://api.push.apple.com'
const APNS_SANDBOX_HOST = 'https://api.sandbox.push.apple.com'

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const env = context.env

  try {
    // Get person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role for any club
    const adminRole = await db
      .prepare(`
        SELECT club_id FROM club_member_roles
        WHERE person_id = ? AND role_key = 'admin'
        LIMIT 1
      `)
      .bind(person.id)
      .first<{ club_id: string }>()

    if (!adminRole) {
      return errorResponse('Admin access required', 403)
    }

    // Check APNs configuration
    const configCheck = {
      APNS_KEY_ID: !!env.APNS_KEY_ID,
      APNS_TEAM_ID: !!env.APNS_TEAM_ID,
      APNS_PRIVATE_KEY: !!env.APNS_PRIVATE_KEY,
      APNS_BUNDLE_ID: env.APNS_BUNDLE_ID || 'com.wwuwh.app',
      APNS_USE_SANDBOX: env.APNS_USE_SANDBOX || 'false',
    }

    const missingConfig = Object.entries(configCheck)
      .filter(([key, value]) => value === false)
      .map(([key]) => key)

    if (missingConfig.length > 0) {
      return jsonResponse({
        success: false,
        error: 'Missing APNs configuration',
        missing: missingConfig,
        config: configCheck,
      })
    }

    // Get device token for current user
    const deviceToken = await db
      .prepare('SELECT token, platform, created_at FROM device_tokens WHERE person_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(person.id)
      .first<{ token: string; platform: string; created_at: string }>()

    if (!deviceToken) {
      return jsonResponse({
        success: false,
        error: 'No device token registered for your account',
        hint: 'Go to Profile > Notifications and tap "Enable Notifications"',
        config: configCheck,
      })
    }

    // Try to create JWT
    let jwt: string | null = null
    try {
      jwt = await createAPNsJWT(env)
    } catch (jwtError) {
      return jsonResponse({
        success: false,
        error: 'Failed to create APNs JWT',
        details: jwtError instanceof Error ? jwtError.message : 'Unknown error',
        config: configCheck,
      })
    }

    if (!jwt) {
      return jsonResponse({
        success: false,
        error: 'Failed to create APNs JWT - check your private key format',
        hint: 'APNS_PRIVATE_KEY should be base64-encoded contents of your .p8 file',
        config: configCheck,
      })
    }

    // Determine APNs host
    const useSandbox = env.APNS_USE_SANDBOX === 'true'
    const apnsHost = useSandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST

    // Send test notification
    const payload = {
      aps: {
        alert: {
          title: 'Test Notification',
          body: 'Your APNs configuration is working!'
        },
        sound: 'default',
        badge: 1
      }
    }

    const response = await fetch(
      `${apnsHost}/3/device/${deviceToken.token}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `bearer ${jwt}`,
          'apns-topic': configCheck.APNS_BUNDLE_ID,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    const responseBody = await response.text()

    if (response.ok) {
      return jsonResponse({
        success: true,
        message: 'Test notification sent successfully!',
        config: configCheck,
        apnsHost,
        devicePlatform: deviceToken.platform,
        tokenRegistered: deviceToken.created_at,
      })
    }

    // Parse error
    let errorReason = responseBody
    try {
      const errorJson = JSON.parse(responseBody)
      errorReason = errorJson.reason || responseBody
    } catch {}

    return jsonResponse({
      success: false,
      error: `APNs error: ${errorReason}`,
      statusCode: response.status,
      config: configCheck,
      apnsHost,
      devicePlatform: deviceToken.platform,
      hint: getErrorHint(response.status, errorReason),
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return errorResponse(message, 500)
  }
})

function getErrorHint(status: number, reason: string): string {
  if (status === 400 && reason === 'BadDeviceToken') {
    return 'The device token is invalid. Try disabling and re-enabling notifications in the app.'
  }
  if (status === 403 && reason === 'InvalidProviderToken') {
    return 'JWT token is invalid. Check APNS_KEY_ID, APNS_TEAM_ID, and APNS_PRIVATE_KEY.'
  }
  if (status === 400 && reason === 'DeviceTokenNotForTopic') {
    return 'Token was not issued for this bundle ID. Check APNS_BUNDLE_ID matches your app.'
  }
  if (status === 410) {
    return 'Device token is no longer valid. The user may have uninstalled the app.'
  }
  if (reason === 'ExpiredProviderToken') {
    return 'JWT expired. This should not happen - check server time.'
  }
  if (reason.includes('MissingTopic')) {
    return 'Bundle ID not set. Make sure APNS_BUNDLE_ID is configured.'
  }
  return `Status ${status}: ${reason}`
}

async function createAPNsJWT(env: Env): Promise<string | null> {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY } = env

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    return null
  }

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
}
