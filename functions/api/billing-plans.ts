/**
 * Billing Plans Endpoint
 * GET /api/billing-plans?club_id=xxx
 *
 * Returns available subscription plans for a club.
 */

import { Env, jsonResponse, errorResponse } from '../types'

interface BillingPlanResponse {
  id: string
  name: string
  price_cents: number
  currency: string
  cadence: string
  weekly_sessions_allowed: number
  stripe_price_id: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    const plans = await db
      .prepare(`
        SELECT
          id,
          name,
          price_cents,
          currency,
          cadence,
          weekly_sessions_allowed,
          stripe_price_id
        FROM billing_plans
        WHERE club_id = ? AND active = 1
        ORDER BY price_cents ASC
      `)
      .bind(clubId)
      .all<BillingPlanResponse>()

    return jsonResponse({
      plans: plans.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
}
