/**
 * Push Notification Device Token Registration
 * POST /api/push/register - Register a device token for push notifications
 * DELETE /api/push/register - Unregister a device token
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth, AuthUser } from '../../middleware/auth'

/**
 * POST /api/push/register
 * Register a device token for the authenticated user
 *
 * Request body:
 * - token: string (APNs device token)
 * - platform: 'ios' | 'android' | 'web'
 *
 * Response:
 * - 200: { success: true }
 * - 400: Missing required fields
 * - 401: Not authenticated
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    // Parse request body
    const body = await context.request.json() as { token?: string; platform?: string }

    if (!body.token) {
      return errorResponse('Missing device token', 400)
    }

    if (!body.platform || !['ios', 'android', 'web'].includes(body.platform)) {
      return errorResponse('Invalid platform. Must be ios, android, or web', 400)
    }

    // Find person by auth_user_id
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('User profile not found', 404)
    }

    // Upsert device token - update if exists, insert if not
    const tokenId = crypto.randomUUID()

    // First, check if this token already exists for any user
    const existingToken = await db
      .prepare('SELECT id, person_id FROM device_tokens WHERE token = ?')
      .bind(body.token)
      .first<{ id: string; person_id: string }>()

    if (existingToken) {
      // Token exists - update to current user if different
      if (existingToken.person_id !== person.id) {
        await db
          .prepare(`
            UPDATE device_tokens
            SET person_id = ?, platform = ?, updated_at = datetime('now')
            WHERE id = ?
          `)
          .bind(person.id, body.platform, existingToken.id)
          .run()
      } else {
        // Same user, just update timestamp
        await db
          .prepare(`
            UPDATE device_tokens
            SET updated_at = datetime('now')
            WHERE id = ?
          `)
          .bind(existingToken.id)
          .run()
      }
    } else {
      // New token - insert
      await db
        .prepare(`
          INSERT INTO device_tokens (id, person_id, token, platform, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `)
        .bind(tokenId, person.id, body.token, body.platform)
        .run()
    }

    console.log(`Device token registered for person ${person.id} (${body.platform})`)

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    console.error('Failed to register device token:', error)
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/push/register
 * Unregister a device token
 *
 * Request body:
 * - token: string (APNs device token to remove)
 *
 * Response:
 * - 200: { success: true }
 * - 400: Missing token
 * - 401: Not authenticated
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    // Parse request body
    const body = await context.request.json() as { token?: string }

    if (!body.token) {
      return errorResponse('Missing device token', 400)
    }

    // Find person by auth_user_id
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('User profile not found', 404)
    }

    // Delete the token for this user
    await db
      .prepare('DELETE FROM device_tokens WHERE token = ? AND person_id = ?')
      .bind(body.token, person.id)
      .run()

    console.log(`Device token unregistered for person ${person.id}`)

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    console.error('Failed to unregister device token:', error)
    return errorResponse(message, 500)
  }
})
