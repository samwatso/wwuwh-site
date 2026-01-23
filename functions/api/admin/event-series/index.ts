/**
 * Admin Event Series Endpoint
 * GET  /api/admin/event-series - List all recurring series
 * POST /api/admin/event-series - Create a new series and generate events
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'
import { generateEventsFromSeries } from './generate-helper'

/**
 * GET /api/admin/event-series
 * List all event series for a club
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
      .bind(clubId)
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
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
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

    const { club_id, title, weekday_mask, start_time_local, start_date } = body

    if (!club_id || !title || weekday_mask === undefined || !start_time_local || !start_date) {
      return errorResponse('club_id, title, weekday_mask, start_time_local, and start_date are required', 400)
    }

    if (weekday_mask === 0) {
      return errorResponse('At least one weekday must be selected', 400)
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
        club_id,
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
      clubId: club_id,
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
      createdByPersonId: person.id,
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
