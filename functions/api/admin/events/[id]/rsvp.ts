/**
 * Admin Event RSVP Endpoint
 * POST /api/admin/events/:id/rsvp - Admin RSVPs on behalf of a member
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface AdminRsvpBody {
  person_id: string
  response: 'yes' | 'no' | 'maybe'
  free_session?: boolean
  note?: string
}

/**
 * POST /api/admin/events/:id/rsvp
 * Admin creates or updates RSVP on behalf of a member
 * If free_session is true, subscription logic is skipped
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
  }

  try {
    const body = await context.request.json() as AdminRsvpBody

    if (!body.person_id) {
      return errorResponse('person_id is required', 400)
    }

    if (!body.response || !['yes', 'no', 'maybe'].includes(body.response)) {
      return errorResponse('response must be yes, no, or maybe', 400)
    }

    // Get admin person record
    const adminPerson = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!adminPerson) {
      return errorResponse('Profile not found', 404)
    }

    // Get event details
    const event = await db
      .prepare(`
        SELECT id, club_id, starts_at_utc, payment_mode, fee_cents
        FROM events
        WHERE id = ?
      `)
      .bind(eventId)
      .first<{
        id: string
        club_id: string
        starts_at_utc: string
        payment_mode: string
        fee_cents: number | null
      }>()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Check admin role for the event's club
    const adminCheck = await isAdmin(db, adminPerson.id, event.club_id)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Verify the target person is a member of the club
    const membership = await db
      .prepare(`
        SELECT id FROM club_memberships
        WHERE club_id = ? AND person_id = ? AND status = 'active'
      `)
      .bind(event.club_id, body.person_id)
      .first()

    if (!membership) {
      return errorResponse('Person is not an active member of this club', 400)
    }

    // Get current RSVP to see if we're changing from yes to something else
    const currentRsvp = await db
      .prepare('SELECT response FROM event_rsvps WHERE event_id = ? AND person_id = ?')
      .bind(eventId, body.person_id)
      .first<{ response: string }>()

    // Check for active subscription (only matters if not a free session)
    const subscription = await db
      .prepare(`
        SELECT ms.id, bp.weekly_sessions_allowed
        FROM member_subscriptions ms
        JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE ms.club_id = ? AND ms.person_id = ? AND ms.status = 'active'
        LIMIT 1
      `)
      .bind(event.club_id, body.person_id)
      .first<{ id: string; weekly_sessions_allowed: number }>()

    // Upsert RSVP
    await db
      .prepare(`
        INSERT INTO event_rsvps (event_id, person_id, response, note, responded_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT (event_id, person_id)
        DO UPDATE SET response = excluded.response, note = excluded.note, responded_at = datetime('now')
      `)
      .bind(eventId, body.person_id, body.response, body.note || null)
      .run()

    // Handle subscription usage (skip if free_session is true)
    let subscriptionUsed = false
    if (!body.free_session && subscription && event.payment_mode !== 'free') {
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
          subscriptionUsed = true
        }
      } else if (body.response !== 'yes' && currentRsvp?.response === 'yes') {
        // Changing from yes to no/maybe - release subscription slot
        await db
          .prepare('DELETE FROM subscription_usages WHERE subscription_id = ? AND event_id = ?')
          .bind(subscription.id, eventId)
          .run()
      }
    }

    // If changing from yes and had a subscription slot, release it
    if (subscription && body.response !== 'yes' && currentRsvp?.response === 'yes') {
      await db
        .prepare('DELETE FROM subscription_usages WHERE subscription_id = ? AND event_id = ?')
        .bind(subscription.id, eventId)
        .run()
    }

    // Get the person's name for response
    const person = await db
      .prepare('SELECT name FROM people WHERE id = ?')
      .bind(body.person_id)
      .first<{ name: string }>()

    return jsonResponse({
      message: `RSVP recorded for ${person?.name || 'member'}`,
      response: body.response,
      free_session: body.free_session || false,
      subscription_used: subscriptionUsed,
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
