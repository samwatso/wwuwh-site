/**
 * Admin External Events Endpoint
 * GET /api/admin/external-events - List external events for admin review
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'

interface ExternalEvent {
  id: string
  source: string
  source_event_id: string
  title: string
  description: string | null
  location: string | null
  starts_at_utc: string
  ends_at_utc: string | null
  // From LEFT JOIN with external_event_links
  decision: 'promoted' | 'ignored' | null
  linked_event_id: string | null
  decided_at: string | null
}

/**
 * GET /api/admin/external-events
 * List external events with their club-specific decision status
 *
 * Query params:
 * - club_id (required): The club to check decisions for
 * - from (optional): Start date filter (default: now)
 * - limit (optional): Max results (default: 50, max: 100)
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, person.id, clubId)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Parse query params
    const from = url.searchParams.get('from') || new Date().toISOString()
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

    // Fetch external events with decision status for this club
    const events = await db
      .prepare(`
        SELECT
          ee.id,
          ee.source,
          ee.source_event_id,
          ee.title,
          ee.description,
          ee.location,
          ee.starts_at_utc,
          ee.ends_at_utc,
          eel.decision,
          eel.linked_event_id,
          eel.decided_at
        FROM external_events ee
        LEFT JOIN external_event_links eel
          ON eel.external_event_id = ee.id
          AND eel.club_id = ?
        WHERE ee.starts_at_utc >= ?
        ORDER BY ee.starts_at_utc ASC
        LIMIT ?
      `)
      .bind(clubId, from, limit)
      .all<ExternalEvent>()

    return jsonResponse({
      external_events: events.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
