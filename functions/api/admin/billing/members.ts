/**
 * Admin Billing Members Endpoint
 * GET /api/admin/billing/members - Get members with billing/subscription info
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAdmin, AdminContext } from '../../../middleware/admin'

interface BillingMember {
  person_id: string
  membership_id: string
  name: string
  email: string
  subscription: {
    id: string
    plan_id: string
    plan_name: string
    cadence: string
    weekly_sessions_allowed: number
    status: string
    is_manual: boolean
    stripe_subscription_id: string | null
    start_at: string
    end_at: string | null
  } | null
  usage_this_week: {
    attended_count: number
    allowed: number
  }
  payment_health: {
    past_due: boolean
    assumed_paid: boolean
    confirmed_paid: boolean
  }
}

interface BillingMembersResponse {
  members: BillingMember[]
  week_start: string
  week_end: string
}

export const onRequestGet: PagesFunction<Env> = withAdmin(async (context, admin: AdminContext) => {
  const db = context.env.WWUWH_DB
  const { clubId } = admin

  const url = new URL(context.request.url)
  const weekStartParam = url.searchParams.get('week_start')

  // Calculate week boundaries
  let weekStart: Date
  if (weekStartParam) {
    weekStart = new Date(weekStartParam)
  } else {
    // Default to current week (Monday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    weekStart = new Date(now.setDate(diff))
  }
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const weekStartStr = weekStart.toISOString()
  const weekEndStr = weekEnd.toISOString()

  try {
    // Get all members with their subscription info
    const membersResult = await db
      .prepare(`
        SELECT
          cm.id as membership_id,
          cm.person_id,
          p.name,
          p.email,
          ms.id as subscription_id,
          ms.plan_id,
          bp.name as plan_name,
          bp.cadence,
          bp.weekly_sessions_allowed,
          ms.status as subscription_status,
          COALESCE(ms.is_manual, CASE WHEN ms.stripe_subscription_id IS NULL AND ms.id IS NOT NULL THEN 1 ELSE 0 END) as is_manual,
          ms.stripe_subscription_id,
          ms.start_at,
          ms.end_at
        FROM club_memberships cm
        JOIN people p ON p.id = cm.person_id
        LEFT JOIN member_subscriptions ms ON ms.person_id = cm.person_id
          AND ms.club_id = cm.club_id
          AND ms.status IN ('active', 'past_due')
        LEFT JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE cm.club_id = ?
          AND cm.status = 'active'
        ORDER BY p.name ASC
      `)
      .bind(clubId)
      .all<{
        membership_id: string
        person_id: string
        name: string
        email: string
        subscription_id: string | null
        plan_id: string | null
        plan_name: string | null
        cadence: string | null
        weekly_sessions_allowed: number | null
        subscription_status: string | null
        is_manual: number
        stripe_subscription_id: string | null
        start_at: string | null
        end_at: string | null
      }>()

    // Get attendance counts for the week
    const attendanceResult = await db
      .prepare(`
        SELECT
          er.person_id,
          COUNT(*) as attended_count
        FROM event_rsvps er
        JOIN events e ON e.id = er.event_id
        WHERE e.club_id = ?
          AND e.starts_at_utc >= ?
          AND e.starts_at_utc <= ?
          AND er.response = 'yes'
        GROUP BY er.person_id
      `)
      .bind(clubId, weekStartStr, weekEndStr)
      .all<{ person_id: string; attended_count: number }>()

    const attendanceMap = new Map(
      attendanceResult.results.map(a => [a.person_id, a.attended_count])
    )

    // Get bank statement matches (confirmed payments)
    const matchedTransactionIds = await db
      .prepare(`
        SELECT DISTINCT tm.transaction_id
        FROM transaction_matches tm
        JOIN transactions t ON t.id = tm.transaction_id
        WHERE t.club_id = ?
      `)
      .bind(clubId)
      .all<{ transaction_id: string }>()

    const matchedTxnSet = new Set(matchedTransactionIds.results.map(m => m.transaction_id))

    // Get recent subscription payments to check confirmed status
    const recentPaymentsResult = await db
      .prepare(`
        SELECT t.person_id, t.id, t.source
        FROM transactions t
        WHERE t.club_id = ?
          AND t.type = 'charge'
          AND t.status = 'succeeded'
          AND date(COALESCE(t.effective_at, t.created_at)) >= date('now', '-35 days')
        ORDER BY t.created_at DESC
      `)
      .bind(clubId)
      .all<{ person_id: string; id: string; source: string }>()

    // Build confirmed payment map (Stripe or matched manual)
    const confirmedPaymentSet = new Set<string>()
    for (const payment of recentPaymentsResult.results) {
      if (payment.source === 'stripe' || matchedTxnSet.has(payment.id)) {
        confirmedPaymentSet.add(payment.person_id)
      }
    }

    // Build response
    const members: BillingMember[] = membersResult.results.map(m => {
      const attendedCount = attendanceMap.get(m.person_id) || 0
      const isManual = m.is_manual === 1
      const hasSubscription = !!m.subscription_id
      const isPastDue = m.subscription_status === 'past_due'
      const hasConfirmedPayment = confirmedPaymentSet.has(m.person_id)

      return {
        person_id: m.person_id,
        membership_id: m.membership_id,
        name: m.name,
        email: m.email,
        subscription: hasSubscription ? {
          id: m.subscription_id!,
          plan_id: m.plan_id!,
          plan_name: m.plan_name!,
          cadence: m.cadence!,
          weekly_sessions_allowed: m.weekly_sessions_allowed!,
          status: m.subscription_status!,
          is_manual: isManual,
          stripe_subscription_id: m.stripe_subscription_id,
          start_at: m.start_at!,
          end_at: m.end_at,
        } : null,
        usage_this_week: {
          attended_count: attendedCount,
          allowed: m.weekly_sessions_allowed || 0,
        },
        payment_health: {
          past_due: isPastDue,
          assumed_paid: isManual && !hasConfirmedPayment,
          confirmed_paid: !isManual || hasConfirmedPayment,
        },
      }
    })

    const response: BillingMembersResponse = {
      members,
      week_start: weekStart.toISOString().split('T')[0],
      week_end: weekEnd.toISOString().split('T')[0],
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
