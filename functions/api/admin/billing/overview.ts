/**
 * Admin Billing Overview Endpoint
 * GET /api/admin/billing/overview - Get billing dashboard data
 * Requires: billing.view permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'

interface DailyTotal {
  date: string
  total_cents: number
  stripe_cents: number
  manual_cents: number
}

interface PlanBreakdown {
  plan_id: string
  plan_name: string
  count: number
  manual_count: number
}

interface OverviewResponse {
  totals: {
    last_30_days: {
      total_collected_cents: number
      stripe_collected_cents: number
      manual_collected_cents: number
      refunds_cents: number
    }
    month_to_date: {
      total_collected_cents: number
      stripe_collected_cents: number
      manual_collected_cents: number
      refunds_cents: number
    }
  }
  subscriptions: {
    active_count: number
    manual_count: number
    by_plan: PlanBreakdown[]
  }
  chart_data: DailyTotal[]
  outstanding_one_off_cents: number
}

export const onRequestGet: PagesFunction<Env> = withPermission(PERMISSIONS.BILLING_VIEW)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const { clubId } = auth

  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]
    const monthStartStr = monthStart.toISOString().split('T')[0]
    const todayStr = now.toISOString().split('T')[0]

    // Get last 30 days totals
    const last30DaysTotals = await db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' THEN amount_cents ELSE 0 END), 0) as total_collected,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' AND source = 'stripe' THEN amount_cents ELSE 0 END), 0) as stripe_collected,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' AND source IN ('cash', 'manual') THEN amount_cents ELSE 0 END), 0) as manual_collected,
          COALESCE(SUM(CASE WHEN type = 'refund' AND status = 'succeeded' THEN amount_cents ELSE 0 END), 0) as refunds
        FROM transactions
        WHERE club_id = ?
          AND date(COALESCE(effective_at, created_at)) >= date(?)
      `)
      .bind(clubId, thirtyDaysAgoStr)
      .first<{
        total_collected: number
        stripe_collected: number
        manual_collected: number
        refunds: number
      }>()

    // Get month-to-date totals
    const mtdTotals = await db
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' THEN amount_cents ELSE 0 END), 0) as total_collected,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' AND source = 'stripe' THEN amount_cents ELSE 0 END), 0) as stripe_collected,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' AND source IN ('cash', 'manual') THEN amount_cents ELSE 0 END), 0) as manual_collected,
          COALESCE(SUM(CASE WHEN type = 'refund' AND status = 'succeeded' THEN amount_cents ELSE 0 END), 0) as refunds
        FROM transactions
        WHERE club_id = ?
          AND date(COALESCE(effective_at, created_at)) >= date(?)
      `)
      .bind(clubId, monthStartStr)
      .first<{
        total_collected: number
        stripe_collected: number
        manual_collected: number
        refunds: number
      }>()

    // Get active subscriptions count with breakdown
    const subscriptionStats = await db
      .prepare(`
        SELECT
          COUNT(*) as active_count,
          SUM(CASE WHEN ms.stripe_subscription_id IS NULL THEN 1 ELSE 0 END) as manual_count
        FROM member_subscriptions ms
        WHERE ms.club_id = ? AND ms.status = 'active'
      `)
      .bind(clubId)
      .first<{ active_count: number; manual_count: number }>()

    // Get subscriptions by plan
    const planBreakdown = await db
      .prepare(`
        SELECT
          bp.id as plan_id,
          bp.name as plan_name,
          COUNT(*) as count,
          SUM(CASE WHEN ms.stripe_subscription_id IS NULL THEN 1 ELSE 0 END) as manual_count
        FROM member_subscriptions ms
        JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE ms.club_id = ? AND ms.status = 'active'
        GROUP BY bp.id, bp.name
        ORDER BY count DESC
      `)
      .bind(clubId)
      .all<PlanBreakdown>()

    // Get daily totals for chart (last 30 days)
    const chartData = await db
      .prepare(`
        SELECT
          date(COALESCE(effective_at, created_at)) as date,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' THEN amount_cents ELSE 0 END), 0) as total_cents,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' AND source = 'stripe' THEN amount_cents ELSE 0 END), 0) as stripe_cents,
          COALESCE(SUM(CASE WHEN type = 'charge' AND status = 'succeeded' AND source IN ('cash', 'manual') THEN amount_cents ELSE 0 END), 0) as manual_cents
        FROM transactions
        WHERE club_id = ?
          AND date(COALESCE(effective_at, created_at)) >= date(?)
        GROUP BY date(COALESCE(effective_at, created_at))
        ORDER BY date ASC
      `)
      .bind(clubId, thirtyDaysAgoStr)
      .all<DailyTotal>()

    // Fill in missing days with zeros
    const chartDataMap = new Map(chartData.results.map(d => [d.date, d]))
    const filledChartData: DailyTotal[] = []
    const current = new Date(thirtyDaysAgo)
    while (current <= now) {
      const dateStr = current.toISOString().split('T')[0]
      const existing = chartDataMap.get(dateStr)
      filledChartData.push(existing || {
        date: dateStr,
        total_cents: 0,
        stripe_cents: 0,
        manual_cents: 0,
      })
      current.setDate(current.getDate() + 1)
    }

    // Get outstanding one-off fees
    const outstanding = await db
      .prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN prr.amount_cents IS NOT NULL THEN prr.amount_cents ELSE pr.amount_cents END
        ), 0) as outstanding_cents
        FROM payment_request_recipients prr
        JOIN payment_requests pr ON pr.id = prr.payment_request_id
        WHERE pr.club_id = ?
          AND pr.status = 'open'
          AND prr.status = 'due'
      `)
      .bind(clubId)
      .first<{ outstanding_cents: number }>()

    const response: OverviewResponse = {
      totals: {
        last_30_days: {
          total_collected_cents: last30DaysTotals?.total_collected || 0,
          stripe_collected_cents: last30DaysTotals?.stripe_collected || 0,
          manual_collected_cents: last30DaysTotals?.manual_collected || 0,
          refunds_cents: last30DaysTotals?.refunds || 0,
        },
        month_to_date: {
          total_collected_cents: mtdTotals?.total_collected || 0,
          stripe_collected_cents: mtdTotals?.stripe_collected || 0,
          manual_collected_cents: mtdTotals?.manual_collected || 0,
          refunds_cents: mtdTotals?.refunds || 0,
        },
      },
      subscriptions: {
        active_count: subscriptionStats?.active_count || 0,
        manual_count: subscriptionStats?.manual_count || 0,
        by_plan: planBreakdown.results || [],
      },
      chart_data: filledChartData,
      outstanding_one_off_cents: outstanding?.outstanding_cents || 0,
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
