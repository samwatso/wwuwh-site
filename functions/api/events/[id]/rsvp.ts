/**
 * Event RSVP Endpoint
 * GET  /api/events/:id/rsvp - Get user's RSVP for an event
 * POST /api/events/:id/rsvp - Create/update RSVP
 *
 * POST body:
 * - response: 'yes' | 'no' | 'maybe'
 * - note: string (optional)
 *
 * TODO: STAGE 5+ - Implement this endpoint
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
  }

  try {
    // Get user's person ID
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    const rsvp = await db
      .prepare('SELECT * FROM event_rsvps WHERE event_id = ? AND person_id = ?')
      .bind(eventId, person.id)
      .first()

    return jsonResponse({ rsvp: rsvp || null })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
  }

  try {
    const body = await context.request.json() as {
      response?: string
      note?: string
      confirm_late_cancel?: boolean
    }

    if (!body.response || !['yes', 'no', 'maybe'].includes(body.response)) {
      return errorResponse('Invalid response. Must be yes, no, or maybe.', 400)
    }

    // Get user's person ID
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found. Please create one first.', 404)
    }

    // Verify event exists and get details
    const event = await db
      .prepare('SELECT id, club_id, kind, starts_at_utc, payment_mode, fee_cents FROM events WHERE id = ?')
      .bind(eventId)
      .first<{ id: string; club_id: string; kind: string; starts_at_utc: string; payment_mode: string; fee_cents: number | null }>()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Verify user is a member of the event's club
    const membership = await db
      .prepare(`
        SELECT id FROM club_memberships
        WHERE club_id = ? AND person_id = ? AND status = 'active'
      `)
      .bind(event.club_id, person.id)
      .first()

    if (!membership) {
      return errorResponse('Not a member of this club', 403)
    }

    // Get current RSVP to see if we're changing from yes to something else
    const currentRsvp = await db
      .prepare('SELECT response FROM event_rsvps WHERE event_id = ? AND person_id = ?')
      .bind(eventId, person.id)
      .first<{ response: string }>()

    // Check if user has a team assignment (for late cancellation warning)
    const teamAssignment = await db
      .prepare(`
        SELECT eta.team_id, et.name as team_name
        FROM event_team_assignments eta
        LEFT JOIN event_teams et ON et.id = eta.team_id
        WHERE eta.event_id = ? AND eta.person_id = ?
      `)
      .bind(eventId, person.id)
      .first<{ team_id: string | null; team_name: string | null }>()

    // If user is changing from yes to no/maybe and has a team assignment
    const isDeclineFromYes = currentRsvp?.response === 'yes' && body.response !== 'yes'
    const hasTeamAssignment = !!teamAssignment?.team_id

    if (isDeclineFromYes && hasTeamAssignment && !body.confirm_late_cancel) {
      // Return warning - client needs to confirm
      return jsonResponse({
        requires_confirmation: true,
        team_name: teamAssignment.team_name,
        message: `You are assigned to ${teamAssignment.team_name || 'a team'}. Declining will remove you from the team.`,
      }, 409) // 409 Conflict - requires confirmation
    }

    // Check for active subscription
    const subscription = await db
      .prepare(`
        SELECT ms.id, bp.weekly_sessions_allowed
        FROM member_subscriptions ms
        JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE ms.club_id = ? AND ms.person_id = ? AND ms.status = 'active'
        LIMIT 1
      `)
      .bind(event.club_id, person.id)
      .first<{ id: string; weekly_sessions_allowed: number }>()

    // Determine if this is a late cancellation
    const isLateCancellation = isDeclineFromYes && hasTeamAssignment && body.confirm_late_cancel

    // Determine cancelled_late value:
    // - If changing to 'yes', clear the flag (they're back!)
    // - If late cancellation, set the flag
    // - Otherwise, keep existing value
    const cancelledLateValue = body.response === 'yes' ? 0 : (isLateCancellation ? 1 : null)

    // Upsert RSVP (include cancelled_late flag)
    await db
      .prepare(`
        INSERT INTO event_rsvps (event_id, person_id, response, note, responded_at, cancelled_late)
        VALUES (?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT (event_id, person_id)
        DO UPDATE SET
          response = excluded.response,
          note = excluded.note,
          responded_at = datetime('now'),
          cancelled_late = CASE
            WHEN ? = 0 THEN 0
            WHEN ? = 1 THEN 1
            ELSE cancelled_late
          END
      `)
      .bind(
        eventId,
        person.id,
        body.response,
        body.note || null,
        isLateCancellation ? 1 : 0,
        cancelledLateValue,
        cancelledLateValue
      )
      .run()

    // If late cancellation confirmed, keep the team assignment but the cancelled_late
    // flag in event_rsvps will mark them as a dropout in the team view
    // (Team assignment is preserved so they remain visible as "Dropped Out")

    // Handle subscription usage - only for sessions with payment_mode = 'included'
    const isSubscriptionEligible = event.kind === 'session' && event.payment_mode === 'included'
    if (subscription && isSubscriptionEligible) {
      if (body.response === 'yes' && currentRsvp?.response !== 'yes') {
        // RSVPing yes - try to use a subscription slot if available
        const eventDate = new Date(event.starts_at_utc)
        const weekStart = getWeekStart(eventDate)
        const weekEnd = getWeekEnd(eventDate)

        // Count sessions used this week
        const usageCount = await db
          .prepare(`
            SELECT COUNT(*) as count
            FROM subscription_usages su
            JOIN events e ON e.id = su.event_id
            WHERE su.subscription_id = ?
              AND e.starts_at_utc >= ?
              AND e.starts_at_utc < ?
          `)
          .bind(subscription.id, weekStart.toISOString(), weekEnd.toISOString())
          .first<{ count: number }>()

        const sessionsUsed = usageCount?.count || 0

        // If sessions available, use one
        if (sessionsUsed < subscription.weekly_sessions_allowed) {
          await db
            .prepare(`
              INSERT OR IGNORE INTO subscription_usages (subscription_id, event_id, used_at)
              VALUES (?, ?, datetime('now'))
            `)
            .bind(subscription.id, eventId)
            .run()
        }
      } else if (body.response !== 'yes' && currentRsvp?.response === 'yes') {
        // Changing from yes to no/maybe - release subscription slot
        await db
          .prepare('DELETE FROM subscription_usages WHERE subscription_id = ? AND event_id = ?')
          .bind(subscription.id, eventId)
          .run()
      }
    }

    const rsvp = await db
      .prepare('SELECT * FROM event_rsvps WHERE event_id = ? AND person_id = ?')
      .bind(eventId, person.id)
      .first()

    // Check if subscription was used for this event
    const subscriptionUsed = subscription ? await db
      .prepare('SELECT 1 FROM subscription_usages WHERE subscription_id = ? AND event_id = ?')
      .bind(subscription.id, eventId)
      .first() : null

    return jsonResponse({
      rsvp,
      subscription_used: !!subscriptionUsed,
      late_cancellation: isLateCancellation,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

// Helper: Get Monday 00:00 of the week containing the given date
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

// Helper: Get Sunday 23:59:59 of the week containing the given date
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return end
}
