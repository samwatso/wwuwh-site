/**
 * Admin Event Series Endpoint
 * GET  /api/admin/event-series - List all recurring series
 * POST /api/admin/event-series - Create a new series and generate events
 *
 * Requires: events.create OR events.edit permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAnyPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'
import { generateEventsFromSeries } from './generate-helper'

/**
 * GET /api/admin/event-series
 * List all event series for a club
 * Requires: events.create OR events.edit permission
 */
export const onRequestGet: PagesFunction<Env> = withAnyPermission([
  PERMISSIONS.EVENTS_CREATE,
  PERMISSIONS.EVENTS_EDIT,
])(async (context, auth: PermissionContext) => {
  const db = context.env.WWUWH_DB

  try {
    // Fetch all series with event counts
    const series = await db
      .prepare(`
        SELECT es.*,
               (SELECT COUNT(*) FROM events WHERE series_id = es.id) as total_events,
               (SELECT COUNT(*) FROM events WHERE series_id = es.id AND starts_at_utc >= datetime('now')) as upcoming_events,
               (SELECT MIN(starts_at_utc) FROM events WHERE series_id = es.id AND starts_at_utc >= datetime('now')) as next_event_at
        FROM event_series es
        WHERE es.club_id = ?
          AND es.archived_at IS NULL
        ORDER BY es.created_at DESC
      `)
      .bind(auth.clubId)
      .all()

    return jsonResponse({
      series: series.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/admin/event-series
 * Create a new recurring series and generate initial events
 * Requires: events.create OR events.edit permission
 */
export const onRequestPost: PagesFunction<Env> = withAnyPermission([
  PERMISSIONS.EVENTS_CREATE,
  PERMISSIONS.EVENTS_EDIT,
])(async (context, auth: PermissionContext) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      title: string
      description?: string
      location?: string
      weekday_mask: number
      start_time_local: string
      duration_min?: number
      start_date: string
      end_date?: string
      visibility_days?: number
      default_fee_cents?: number
      currency?: string
      payment_mode?: 'included' | 'one_off' | 'free'
      generate_weeks?: number
    }

    const { title, weekday_mask, start_time_local, start_date } = body

    if (!title || weekday_mask === undefined || !start_time_local || !start_date) {
      return errorResponse('title, weekday_mask, start_time_local, and start_date are required', 400)
    }

    if (weekday_mask === 0) {
      return errorResponse('At least one weekday must be selected', 400)
    }

    // Generate series ID
    const seriesId = crypto.randomUUID()
    const visibilityDays = body.visibility_days ?? 5
    const durationMin = body.duration_min ?? 90
    const generateWeeks = body.generate_weeks ?? 8

    // Create series
    await db
      .prepare(`
        INSERT INTO event_series (
          id, club_id, title, description, location,
          weekday_mask, start_time_local, duration_min,
          start_date, end_date, visibility_days,
          default_fee_cents, currency, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        seriesId,
        auth.clubId,
        title,
        body.description || null,
        body.location || null,
        weekday_mask,
        start_time_local,
        durationMin,
        start_date,
        body.end_date || null,
        visibilityDays,
        body.default_fee_cents || null,
        body.currency || 'GBP'
      )
      .run()

    // Generate events for the next N weeks
    const eventsCreated = await generateEventsFromSeries(db, {
      seriesId,
      clubId: auth.clubId,
      title,
      description: body.description || null,
      location: body.location || null,
      weekdayMask: weekday_mask,
      startTimeLocal: start_time_local,
      durationMin,
      startDate: start_date,
      endDate: body.end_date || null,
      visibilityDays,
      feeCents: body.default_fee_cents || null,
      currency: body.currency || 'GBP',
      paymentMode: body.payment_mode || 'included',
      generateWeeks,
      createdByPersonId: auth.person.id,
    })

    // Fetch the created series
    const series = await db
      .prepare('SELECT * FROM event_series WHERE id = ?')
      .bind(seriesId)
      .first()

    return jsonResponse({
      series,
      events_created: eventsCreated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
