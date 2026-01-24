/**
 * Admin External Events Endpoint
 * GET /api/admin/external-events - List external events for admin review
 * POST /api/admin/external-events - Create a manual external event
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
  url: string | null
  starts_at_utc: string
  ends_at_utc: string | null
  status: string
  origin: string | null
  visibility: string | null
  created_by_person_id: string | null
  // From LEFT JOIN with external_event_links
  decision: 'promoted' | 'ignored' | 'undecided' | null
  event_id: string | null
  decided_at: string | null
}

interface CreateManualEventRequest {
  club_id: string
  title: string
  description?: string
  location?: string
  url?: string
  source?: string
  starts_at_utc: string
  ends_at_utc?: string
  status?: 'active' | 'cancelled' | 'tentative'
  visibility?: 'public' | 'admin_only' | 'coach_only'
}

/**
 * GET /api/admin/external-events
 * List external events with their club-specific decision status
 *
 * Query params:
 * - club_id (required): The club to check decisions for
 * - kind (optional): 'uk' for imported UK events, 'manual' for manually created events
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
    const kind = url.searchParams.get('kind') // 'uk' | 'manual' | null (default: all)

    // Build WHERE clause based on kind filter
    let kindFilter = ''
    if (kind === 'uk') {
      // UK imported events: origin='import' OR source='uk_national'
      kindFilter = "AND (ee.origin = 'import' OR ee.source = 'uk_national')"
    } else if (kind === 'manual') {
      // Manual events: origin='manual'
      kindFilter = "AND ee.origin = 'manual'"
    }

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
          ee.url,
          ee.starts_at_utc,
          ee.ends_at_utc,
          ee.status,
          ee.origin,
          ee.visibility,
          ee.created_by_person_id,
          eel.decision,
          eel.event_id,
          eel.decided_at
        FROM external_events ee
        LEFT JOIN external_event_links eel
          ON eel.external_event_id = ee.id
          AND eel.club_id = ?
        WHERE ee.starts_at_utc >= ?
        ${kindFilter}
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

/**
 * POST /api/admin/external-events
 * Create a manual external event
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  let body: CreateManualEventRequest
  try {
    body = await context.request.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { club_id: clubId, title, description, location, url, source, starts_at_utc, ends_at_utc, status, visibility } = body

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  if (!title || !starts_at_utc) {
    return errorResponse('title and starts_at_utc are required', 400)
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

    // Generate IDs
    const id = crypto.randomUUID()
    const sourceEventId = `manual:${id}`
    const now = new Date().toISOString()

    // Create the external event
    await db
      .prepare(`
        INSERT INTO external_events (
          id,
          source,
          source_event_id,
          title,
          description,
          location,
          url,
          starts_at_utc,
          ends_at_utc,
          status,
          origin,
          visibility,
          created_by_person_id,
          last_seen_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)
      `)
      .bind(
        id,
        source || 'other',
        sourceEventId,
        title,
        description || null,
        location || null,
        url || null,
        starts_at_utc,
        ends_at_utc || null,
        status || 'active',
        visibility || 'admin_only',
        person.id,
        now,
        now
      )
      .run()

    // Fetch the created event
    const created = await db
      .prepare(`
        SELECT
          id,
          source,
          source_event_id,
          title,
          description,
          location,
          url,
          starts_at_utc,
          ends_at_utc,
          status,
          origin,
          visibility,
          created_by_person_id
        FROM external_events
        WHERE id = ?
      `)
      .bind(id)
      .first<ExternalEvent>()

    return jsonResponse({
      external_event: created,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
