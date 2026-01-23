/**
 * Generate Events from Series Endpoint
 * POST /api/admin/event-series/:id/generate - Generate more events
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'
import { generateEventsFromSeries } from '../generate-helper'

interface EventSeries {
  id: string
  club_id: string
  title: string
  description: string | null
  location: string | null
  weekday_mask: number
  start_time_local: string
  duration_min: number
  start_date: string
  end_date: string | null
  visibility_days: number
  default_fee_cents: number | null
  currency: string
}

/**
 * POST /api/admin/event-series/:id/generate
 * Generate additional events for a series
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      weeks?: number  // How many weeks to generate (default 8)
      from_date?: string  // Start generating from this date (default: today)
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

    // Fetch series
    const series = await db
      .prepare('SELECT * FROM event_series WHERE id = ? AND club_id = ? AND archived_at IS NULL')
      .bind(seriesId, club_id)
      .first<EventSeries>()

    if (!series) {
      return errorResponse('Series not found or archived', 404)
    }

    const weeks = body.weeks ?? 8
    const fromDate = body.from_date || new Date().toISOString().split('T')[0]

    // Generate events
    const eventsCreated = await generateEventsFromSeries(db, {
      seriesId: series.id,
      clubId: series.club_id,
      title: series.title,
      description: series.description,
      location: series.location,
      weekdayMask: series.weekday_mask,
      startTimeLocal: series.start_time_local,
      durationMin: series.duration_min,
      startDate: series.start_date,
      endDate: series.end_date,
      visibilityDays: series.visibility_days,
      feeCents: series.default_fee_cents,
      currency: series.currency,
      paymentMode: 'included', // Default for generated events
      generateWeeks: weeks,
      createdByPersonId: person.id,
      fromDate,
    })

    // Get updated event count
    const stats = await db
      .prepare(`
        SELECT
          COUNT(*) as total_events,
          SUM(CASE WHEN starts_at_utc >= datetime('now') THEN 1 ELSE 0 END) as upcoming_events,
          MAX(starts_at_utc) as last_event_at
        FROM events
        WHERE series_id = ?
      `)
      .bind(seriesId)
      .first<{ total_events: number; upcoming_events: number; last_event_at: string }>()

    return jsonResponse({
      success: true,
      events_created: eventsCreated,
      total_events: stats?.total_events || 0,
      upcoming_events: stats?.upcoming_events || 0,
      last_event_at: stats?.last_event_at || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
