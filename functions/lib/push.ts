/**
 * Unified Push Notification Service
 *
 * Sends push notifications to both iOS (APNs) and Android (FCM) devices.
 */

import { Env } from '../types'
import { sendPushNotification as sendAPNs, sendPushNotifications as sendAPNsMultiple } from './apns'
import { sendFCMNotification, sendFCMNotifications } from './fcm'

interface DeviceToken {
  token: string
  platform: 'ios' | 'android'
  person_id: string
}

interface NotificationPayload {
  title: string
  body: string
  data?: Record<string, string>
}

interface SendResult {
  success: boolean
  deviceToken: string
  platform: string
  error?: string
  statusCode?: number
}

/**
 * Send notification to a single device (auto-detects platform)
 */
export async function sendNotification(
  env: Env,
  deviceToken: string,
  platform: 'ios' | 'android',
  payload: NotificationPayload
): Promise<SendResult> {
  if (platform === 'ios') {
    const result = await sendAPNs(env, deviceToken, {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body
        },
        sound: 'default',
        badge: 1
      },
      ...payload.data
    })
    return { ...result, platform: 'ios' }
  } else {
    const result = await sendFCMNotification(env, deviceToken, {
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default'
        }
      }
    })
    return { ...result, platform: 'android' }
  }
}

/**
 * Send notifications to multiple devices (handles both platforms)
 */
export async function sendNotifications(
  env: Env,
  devices: DeviceToken[],
  payload: NotificationPayload
): Promise<SendResult[]> {
  // Separate by platform
  const iosTokens = devices.filter(d => d.platform === 'ios').map(d => d.token)
  const androidTokens = devices.filter(d => d.platform === 'android').map(d => d.token)

  const results: SendResult[] = []

  // Send to iOS devices
  if (iosTokens.length > 0) {
    const iosResults = await sendAPNsMultiple(env, iosTokens, {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body
        },
        sound: 'default',
        badge: 1
      },
      ...payload.data
    })
    results.push(...iosResults.map(r => ({ ...r, platform: 'ios' })))
  }

  // Send to Android devices
  if (androidTokens.length > 0) {
    const androidResults = await sendFCMNotifications(env, androidTokens, {
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default'
        }
      }
    })
    results.push(...androidResults.map(r => ({ ...r, platform: 'android' })))
  }

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

// Map event kind to display label
const EVENT_KIND_LABELS: Record<string, string> = {
  session: 'Session',
  training: 'Training',
  match: 'Match',
  tournament: 'Tournament',
  social: 'Social',
  ladies: 'Ladies',
  other: 'Event',
}

/**
 * Send event invitation notifications to all platforms
 */
export async function sendEventInvitationNotifications(
  env: Env,
  db: D1Database,
  eventId: string,
  eventTitle: string,
  eventKind: string,
  startsAtUtc: string,
  timezone: string,
  clubName: string,
  invitedPersonIds: string[]
): Promise<void> {
  if (invitedPersonIds.length === 0) {
    console.log('No invited person IDs provided')
    return
  }

  // Get device tokens with platform for invited people
  const placeholders = invitedPersonIds.map(() => '?').join(',')
  const tokens = await db
    .prepare(`
      SELECT token, platform, person_id FROM device_tokens
      WHERE person_id IN (${placeholders})
    `)
    .bind(...invitedPersonIds)
    .all<DeviceToken>()

  if (!tokens.results?.length) {
    console.log('No device tokens found for invited people')
    return
  }

  // Format notification: "Session Invite: Thursday Session - Tue 28 Jan, 7:30pm"
  const kindLabel = EVENT_KIND_LABELS[eventKind] || 'Event'
  const dateTime = formatEventDateTime(startsAtUtc, timezone)
  const body = dateTime
    ? `${kindLabel} Invite: ${eventTitle} - ${dateTime}`
    : `${kindLabel} Invite: ${eventTitle}`

  const payload: NotificationPayload = {
    title: clubName,
    body,
    data: { eventId, type: 'event_invite' }
  }

  const results = await sendNotifications(env, tokens.results, payload)

  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const iosCount = results.filter(r => r.platform === 'ios' && r.success).length
  const androidCount = results.filter(r => r.platform === 'android' && r.success).length

  console.log(`Event invitation notifications: ${successful} sent (iOS: ${iosCount}, Android: ${androidCount}), ${failed} failed`)

  // Clean up invalid tokens
  // iOS: 410 = token no longer valid
  // Android: 404 or UNREGISTERED = token invalid
  const invalidTokens = results
    .filter(r => r.statusCode === 410 || r.statusCode === 404 || r.error?.includes('UNREGISTERED'))
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

/**
 * Send badge unlock notification to a single person
 */
export async function sendBadgeUnlockNotification(
  env: Env,
  db: D1Database,
  personId: string,
  badgeName: string,
  badgeDescription: string
): Promise<void> {
  // Get device token for the person
  const token = await db
    .prepare('SELECT token, platform, person_id FROM device_tokens WHERE person_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(personId)
    .first<DeviceToken>()

  if (!token) {
    console.log(`No device token found for person ${personId}`)
    return
  }

  const payload: NotificationPayload = {
    title: '🏆 Badge Unlocked!',
    body: `${badgeName} - ${badgeDescription}`,
    data: { type: 'badge_unlock', badgeName }
  }

  const result = await sendNotification(env, token.token, token.platform as 'ios' | 'android', payload)

  if (result.success) {
    console.log(`Badge unlock notification sent to person ${personId}: ${badgeName}`)
  } else {
    console.log(`Failed to send badge notification to person ${personId}: ${result.error}`)

    // Clean up invalid token
    if (result.statusCode === 410 || result.statusCode === 404) {
      await db
        .prepare('DELETE FROM device_tokens WHERE token = ?')
        .bind(token.token)
        .run()
      console.log(`Cleaned up invalid device token for person ${personId}`)
    }
  }
}
