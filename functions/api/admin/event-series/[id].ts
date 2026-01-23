/**
 * Admin Event Series Detail Endpoint
 * GET    /api/admin/event-series/:id - Get series details
 * PUT    /api/admin/event-series/:id - Update series
 * DELETE /api/admin/event-series/:id - Archive series
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'

/**
 * GET /api/admin/event-series/:id
 * Get series details with upcoming events
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string
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

    // Fetch series
    const series = await db
      .prepare(`
        SELECT es.*,
               (SELECT COUNT(*) FROM events WHERE series_id = es.id) as total_events,
               (SELECT COUNT(*) FROM events WHERE series_id = es.id AND starts_at_utc >= datetime('now')) as upcoming_events,
               (SELECT MAX(starts_at_utc) FROM events WHERE series_id = es.id) as last_event_at
        FROM event_series es
        WHERE es.id = ? AND es.club_id = ?
      `)
      .bind(seriesId, clubId)
      .first()

    if (!series) {
      return errorResponse('Series not found', 404)
    }

    // Fetch upcoming events for this series
    const events = await db
      .prepare(`
        SELECT e.*,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'yes') as rsvp_yes_count
        FROM events e
        WHERE e.series_id = ?
          AND e.starts_at_utc >= datetime('now')
        ORDER BY e.starts_at_utc ASC
        LIMIT 20
      `)
      .bind(seriesId)
      .all()

    return jsonResponse({
      series,
      upcoming_events: events.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * PUT /api/admin/event-series/:id
 * Update a series (does not affect already-generated events)
 */
export const onRequestPut: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      title?: string
      description?: string
      location?: string
      weekday_mask?: number
      start_time_local?: string
      duration_min?: number
      end_date?: string | null
      visibility_days?: number
      default_fee_cents?: number | null
      currency?: string
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

    // Check series exists
    const existingSeries = await db
      .prepare('SELECT id FROM event_series WHERE id = ? AND club_id = ?')
      .bind(seriesId, club_id)
      .first()

    if (!existingSeries) {
      return errorResponse('Series not found', 404)
    }

    // Build update fields
    const updates: string[] = []
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
    if (body.weekday_mask !== undefined) {
      updates.push('weekday_mask = ?')
      values.push(body.weekday_mask)
    }
    if (body.start_time_local !== undefined) {
      updates.push('start_time_local = ?')
      values.push(body.start_time_local)
    }
    if (body.duration_min !== undefined) {
      updates.push('duration_min = ?')
      values.push(body.duration_min)
    }
    if (body.end_date !== undefined) {
      updates.push('end_date = ?')
      values.push(body.end_date)
    }
    if (body.visibility_days !== undefined) {
      updates.push('visibility_days = ?')
      values.push(body.visibility_days)
    }
    if (body.default_fee_cents !== undefined) {
      updates.push('default_fee_cents = ?')
      values.push(body.default_fee_cents)
    }
    if (body.currency !== undefined) {
      updates.push('currency = ?')
      values.push(body.currency)
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400)
    }

    // Execute update
    await db
      .prepare(`UPDATE event_series SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values, seriesId)
      .run()

    // Fetch updated series
    const series = await db
      .prepare('SELECT * FROM event_series WHERE id = ?')
      .bind(seriesId)
      .first()

    return jsonResponse({ series })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/event-series/:id
 * Archive a series (keeps events, stops generating new ones)
 * Query param: ?hard=true to delete series and all future events
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string
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

    // Check series exists
    const existingSeries = await db
      .prepare('SELECT id FROM event_series WHERE id = ? AND club_id = ?')
      .bind(seriesId, clubId)
      .first()

    if (!existingSeries) {
      return errorResponse('Series not found', 404)
    }

    if (hardDelete) {
      // Delete future events from this series
      const deleted = await db
        .prepare(`
          DELETE FROM events
          WHERE series_id = ?
            AND starts_at_utc >= datetime('now')
        `)
        .bind(seriesId)
        .run()

      // Delete the series
      await db
        .prepare('DELETE FROM event_series WHERE id = ?')
        .bind(seriesId)
        .run()

      return jsonResponse({
        success: true,
        deleted: true,
        events_deleted: deleted.meta.changes,
      })
    } else {
      // Soft delete: archive the series
      await db
        .prepare(`UPDATE event_series SET archived_at = datetime('now') WHERE id = ?`)
        .bind(seriesId)
        .run()

      return jsonResponse({ success: true, archived: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
