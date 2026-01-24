/**
 * Events List Endpoint
 * GET /api/events - List events for a club
 *
 * Query parameters:
 * - club_id: string (required)
 * - from: ISO date string (optional, defaults to now)
 * - to: ISO date string (optional, defaults to +30 days)
 * - status: 'scheduled' | 'cancelled' | 'completed' (optional)
 * - kind: 'session' | 'match' | 'tournament' | 'social' | 'other' (optional)
 * - limit: number (optional, max 100)
 *
 * TODO: STAGE 5+ - Implement this endpoint
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get user's person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Verify user is a member of this club
    const membership = await db
      .prepare(`
        SELECT id, member_type FROM club_memberships
        WHERE club_id = ? AND person_id = ? AND status = 'active'
      `)
      .bind(clubId, person.id)
      .first<{ id: string; member_type: string }>()

    if (!membership) {
      return errorResponse('Not a member of this club', 403)
    }

    // Check for active subscription
    const subscription = await db
      .prepare(`
        SELECT ms.id, ms.status, bp.weekly_sessions_allowed, bp.name as plan_name
        FROM member_subscriptions ms
        JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE ms.club_id = ? AND ms.person_id = ? AND ms.status = 'active'
        LIMIT 1
      `)
      .bind(clubId, person.id)
      .first<{ id: string; status: string; weekly_sessions_allowed: number; plan_name: string }>()

    // Parse query params
    const from = url.searchParams.get('from') || new Date().toISOString()
    const to = url.searchParams.get('to') || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    const status = url.searchParams.get('status') || 'scheduled'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

    // Build visibility and invitation filter
    // This is the member-facing endpoint - always filter by visibility AND invitation
    // Admins can use /api/admin/events to see all events including hidden ones
    const now = new Date().toISOString()

    // All users on member-facing view:
    // 1. Event must be visible (visible_from has passed or is null)
    // 2. User must be invited (directly or via group membership)
    const invitationFilter = `
      AND (e.visible_from IS NULL OR e.visible_from <= '${now}')
      AND EXISTS (
        SELECT 1 FROM event_invitations ei
        WHERE ei.event_id = e.id
        AND (
          ei.person_id = '${person.id}'
          OR (ei.group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.group_id = ei.group_id AND gm.person_id = '${person.id}'
          ))
        )
      )`

    // Fetch events with RSVP counts and payment status
    const events = await db
      .prepare(`
        SELECT e.*,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'yes') as rsvp_yes_count,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'no') as rsvp_no_count,
               (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND response = 'maybe') as rsvp_maybe_count,
               (SELECT response FROM event_rsvps WHERE event_id = e.id AND person_id = ?) as my_rsvp,
               (SELECT CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END FROM transactions WHERE event_id = e.id AND person_id = ? AND type = 'charge' ORDER BY created_at DESC LIMIT 1) as has_paid,
               (SELECT 1 FROM subscription_usages su WHERE su.event_id = e.id AND su.subscription_id = ?) as subscription_used
        FROM events e
        WHERE e.club_id = ?
          AND e.status = ?
          AND e.starts_at_utc >= ?
          AND e.starts_at_utc <= ?
          ${invitationFilter}
        ORDER BY e.starts_at_utc ASC
        LIMIT ?
      `)
      .bind(person.id, person.id, subscription?.id || '', clubId, status, from, to, limit)
      .all()

    // For each event, calculate if payment is required based on subscription
    const eventsWithPaymentInfo = await Promise.all(
      (events.results as Record<string, unknown>[]).map(async (event) => {
        // Get the week boundaries for this event (Monday to Sunday)
        const eventDate = new Date(event.starts_at_utc as string)
        const weekStart = getWeekStart(eventDate)
        const weekEnd = getWeekEnd(eventDate)

        let sessionsUsedThisWeek = 0
        let paymentRequired = true

        // Subscription only applies to sessions with payment_mode = 'included'
        const isSubscriptionEligible = event.kind === 'session' && event.payment_mode === 'included'

        if (subscription && isSubscriptionEligible) {
          // Count sessions used this week via subscription
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

          sessionsUsedThisWeek = usageCount?.count || 0

          // Check if this specific event already used a subscription slot
          const alreadyUsedForThisEvent = event.subscription_used === 1

          // Payment NOT required if:
          // - Already used subscription for this event, OR
          // - Has sessions remaining this week
          if (alreadyUsedForThisEvent || sessionsUsedThisWeek < subscription.weekly_sessions_allowed) {
            paymentRequired = false
          }
        }

        // If already paid, no payment required
        if (event.has_paid === 1) {
          paymentRequired = false
        }

        // Free events don't require payment
        if (event.payment_mode === 'free' || !event.fee_cents) {
          paymentRequired = false
        }

        return {
          ...event,
          subscription_status: subscription?.status || null,
          subscription_plan: subscription?.plan_name || null,
          sessions_allowed: subscription?.weekly_sessions_allowed || 0,
          sessions_used_this_week: sessionsUsedThisWeek,
          payment_required: paymentRequired,
        }
      })
    )

    return jsonResponse({
      events: eventsWithPaymentInfo,
      subscription: subscription ? {
        status: subscription.status,
        plan_name: subscription.plan_name,
        weekly_sessions_allowed: subscription.weekly_sessions_allowed,
      } : null,
      member_type: membership.member_type,
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
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // Adjust for Sunday
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

/**
 * POST /api/events - Create a new event
 * TODO: STAGE 5+ - Implement event creation (admin only)
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (_context, _user) => {
  // TODO: STAGE 5+ - Check user has admin role for club
  // TODO: STAGE 5+ - Create event
  return errorResponse('Event creation coming in Stage 5+', 501)
})
