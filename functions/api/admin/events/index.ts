/**
 * Admin Events Endpoint
 * GET  /api/admin/events - List all events (including future/not-visible)
 * POST /api/admin/events - Create a new event
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'

/**
 * GET /api/admin/events
 * List all events for admin (including future/hidden events)
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
    const to = url.searchParams.get('to') || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    const status = url.searchParams.get('status') // null = all statuses
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200)

    // Build status filter
    const statusFilter = status ? `AND e.status = '${status}'` : ''

    // Fetch all events (including hidden ones) with RSVP counts
    const events = await db
      .prepare(`
        SELECT e.*,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'yes') as rsvp_yes_count,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'no') as rsvp_no_count,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'maybe') as rsvp_maybe_count,
               es.title as series_title
        FROM events e
        LEFT JOIN event_series es ON es.id = e.series_id
        WHERE e.club_id = ?
          AND e.starts_at_utc >= ?
          AND e.starts_at_utc <= ?
          ${statusFilter}
        ORDER BY e.starts_at_utc ASC
        LIMIT ?
      `)
      .bind(clubId, from, to, limit)
      .all()

    return jsonResponse({
      events: events.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/admin/events
 * Create a new single event
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      title: string
      description?: string
      location?: string
      kind?: 'session' | 'match' | 'tournament' | 'social' | 'other'
      starts_at_utc: string
      ends_at_utc: string
      timezone?: string
      capacity?: number
      payment_mode?: 'included' | 'one_off' | 'free'
      fee_cents?: number
      visible_from?: string
    }

    const { club_id, title, starts_at_utc, ends_at_utc } = body

    if (!club_id || !title || !starts_at_utc || !ends_at_utc) {
      return errorResponse('club_id, title, starts_at_utc, and ends_at_utc are required', 400)
    }

    // Get person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, person.id, club_id)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Generate event ID
    const eventId = crypto.randomUUID()

    // Calculate default visible_from (5 days before event)
    const eventDate = new Date(starts_at_utc)
    const defaultVisibleFrom = new Date(eventDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const visibleFrom = body.visible_from || defaultVisibleFrom

    // Create event
    await db
      .prepare(`
        INSERT INTO events (
          id, club_id, title, description, location, kind,
          starts_at_utc, ends_at_utc, timezone, capacity,
          payment_mode, fee_cents, visible_from,
          created_by_person_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .bind(
        eventId,
        club_id,
        title,
        body.description || null,
        body.location || null,
        body.kind || 'session',
        starts_at_utc,
        ends_at_utc,
        body.timezone || 'Europe/London',
        body.capacity || null,
        body.payment_mode || 'included',
        body.fee_cents || null,
        visibleFrom,
        person.id
      )
      .run()

    // Fetch the created event
    const event = await db
      .prepare('SELECT * FROM events WHERE id = ?')
      .bind(eventId)
      .first()

    return jsonResponse({ event })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
