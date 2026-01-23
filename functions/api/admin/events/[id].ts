/**
 * Admin Event Detail Endpoint
 * GET    /api/admin/events/:id - Get event details
 * PUT    /api/admin/events/:id - Update event
 * DELETE /api/admin/events/:id - Cancel/delete event
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'

/**
 * GET /api/admin/events/:id
 * Get event details with RSVPs
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string
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

    // Fetch event with series info
    const event = await db
      .prepare(`
        SELECT e.*,
               es.title as series_title,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'yes') as rsvp_yes_count,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'no') as rsvp_no_count,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'maybe') as rsvp_maybe_count
        FROM events e
        LEFT JOIN event_series es ON es.id = e.series_id
        WHERE e.id = ? AND e.club_id = ?
      `)
      .bind(eventId, clubId)
      .first()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Fetch RSVPs with person details
    const rsvps = await db
      .prepare(`
        SELECT er.*, p.name, p.email
        FROM event_rsvps er
        JOIN people p ON p.id = er.person_id
        WHERE er.event_id = ?
        ORDER BY er.response, p.name
      `)
      .bind(eventId)
      .all()

    return jsonResponse({
      event,
      rsvps: rsvps.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * PUT /api/admin/events/:id
 * Update an event
 */
export const onRequestPut: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      title?: string
      description?: string
      location?: string
      kind?: 'session' | 'match' | 'tournament' | 'social' | 'other'
      starts_at_utc?: string
      ends_at_utc?: string
      timezone?: string
      capacity?: number
      status?: 'scheduled' | 'cancelled' | 'completed'
      payment_mode?: 'included' | 'one_off' | 'free'
      fee_cents?: number
      visible_from?: string
    }

    const { club_id } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
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

    // Check event exists
    const existingEvent = await db
      .prepare('SELECT id FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, club_id)
      .first()

    if (!existingEvent) {
      return errorResponse('Event not found', 404)
    }

    // Build update fields
    const updates: string[] = ['updated_at = datetime(\'now\')']
    const values: (string | number | null)[] = []

    if (body.title !== undefined) {
      updates.push('title = ?')
      values.push(body.title)
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      values.push(body.description)
    }
    if (body.location !== undefined) {
      updates.push('location = ?')
      values.push(body.location)
    }
    if (body.kind !== undefined) {
      updates.push('kind = ?')
      values.push(body.kind)
    }
    if (body.starts_at_utc !== undefined) {
      updates.push('starts_at_utc = ?')
      values.push(body.starts_at_utc)
    }
    if (body.ends_at_utc !== undefined) {
      updates.push('ends_at_utc = ?')
      values.push(body.ends_at_utc)
    }
    if (body.timezone !== undefined) {
      updates.push('timezone = ?')
      values.push(body.timezone)
    }
    if (body.capacity !== undefined) {
      updates.push('capacity = ?')
      values.push(body.capacity)
    }
    if (body.status !== undefined) {
      updates.push('status = ?')
      values.push(body.status)
    }
    if (body.payment_mode !== undefined) {
      updates.push('payment_mode = ?')
      values.push(body.payment_mode)
    }
    if (body.fee_cents !== undefined) {
      updates.push('fee_cents = ?')
      values.push(body.fee_cents)
    }
    if (body.visible_from !== undefined) {
      updates.push('visible_from = ?')
      values.push(body.visible_from)
    }

    // Execute update
    await db
      .prepare(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values, eventId)
      .run()

    // Fetch updated event
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

/**
 * DELETE /api/admin/events/:id
 * Cancel or delete an event
 * Query param: ?hard=true to permanently delete (default: set status to cancelled)
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')
  const hardDelete = url.searchParams.get('hard') === 'true'

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

    // Check event exists
    const existingEvent = await db
      .prepare('SELECT id, status FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, clubId)
      .first<{ id: string; status: string }>()

    if (!existingEvent) {
      return errorResponse('Event not found', 404)
    }

    if (hardDelete) {
      // Permanently delete event and related data
      await db
        .prepare('DELETE FROM events WHERE id = ?')
        .bind(eventId)
        .run()

      return jsonResponse({ success: true, deleted: true })
    } else {
      // Soft delete: set status to cancelled
      await db
        .prepare(`UPDATE events SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`)
        .bind(eventId)
        .run()

      return jsonResponse({ success: true, cancelled: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
