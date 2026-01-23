/**
 * Admin Member Subscription Endpoint
 * POST   /api/admin/members/:id/subscription - Create manual subscription
 * DELETE /api/admin/members/:id/subscription - Cancel subscription
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface CreateSubscriptionBody {
  plan_id: string
  payment_source: 'cash' | 'bacs' | 'free'
  payment_reference?: string
  amount_cents?: number
  start_at?: string
}

/**
 * POST /api/admin/members/:id/subscription
 * Create a manual subscription for a member
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')
  const memberId = context.params.id as string

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  if (!memberId) {
    return errorResponse('Member ID is required', 400)
  }

  try {
    const body = await context.request.json() as CreateSubscriptionBody

    if (!body.plan_id) {
      return errorResponse('plan_id is required', 400)
    }

    if (!body.payment_source || !['cash', 'bacs', 'free'].includes(body.payment_source)) {
      return errorResponse('payment_source must be cash, bacs, or free', 400)
    }

    // Get admin person record
    const adminPerson = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!adminPerson) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, adminPerson.id, clubId)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Get member details (memberId is club_membership id)
    const member = await db
      .prepare(`
        SELECT cm.person_id, p.name
        FROM club_memberships cm
        JOIN people p ON p.id = cm.person_id
        WHERE cm.id = ? AND cm.club_id = ?
      `)
      .bind(memberId, clubId)
      .first<{ person_id: string; name: string }>()

    if (!member) {
      return errorResponse('Member not found', 404)
    }

    // Check if member already has an active subscription
    const existingSub = await db
      .prepare(`
        SELECT id FROM member_subscriptions
        WHERE person_id = ? AND club_id = ? AND status = 'active'
      `)
      .bind(member.person_id, clubId)
      .first()

    if (existingSub) {
      return errorResponse('Member already has an active subscription. Cancel it first.', 409)
    }

    // Get billing plan details
    const plan = await db
      .prepare(`
        SELECT id, name, price_cents, currency
        FROM billing_plans
        WHERE id = ? AND club_id = ? AND active = 1
      `)
      .bind(body.plan_id, clubId)
      .first<{ id: string; name: string; price_cents: number; currency: string }>()

    if (!plan) {
      return errorResponse('Billing plan not found', 404)
    }

    // Generate IDs
    const subscriptionId = crypto.randomUUID()
    const transactionId = crypto.randomUUID()

    // Determine start date
    const startAt = body.start_at || new Date().toISOString().split('T')[0]

    // Create subscription (no Stripe fields)
    await db
      .prepare(`
        INSERT INTO member_subscriptions (
          id, club_id, person_id, plan_id, status, start_at, created_at
        )
        VALUES (?, ?, ?, ?, 'active', ?, datetime('now'))
      `)
      .bind(subscriptionId, clubId, member.person_id, body.plan_id, startAt)
      .run()

    // Create transaction if not free
    if (body.payment_source !== 'free') {
      const amount = body.amount_cents ?? plan.price_cents
      const source = body.payment_source === 'cash' ? 'cash' : 'manual'

      await db
        .prepare(`
          INSERT INTO transactions (
            id, club_id, person_id, source, type, amount_cents, currency,
            status, collected_by_person_id, created_at, effective_at
          )
          VALUES (?, ?, ?, ?, 'charge', ?, ?, 'succeeded', ?, datetime('now'), datetime('now'))
        `)
        .bind(
          transactionId,
          clubId,
          member.person_id,
          source,
          amount,
          plan.currency,
          adminPerson.id
        )
        .run()
    }

    return jsonResponse({
      subscription_id: subscriptionId,
      transaction_id: body.payment_source !== 'free' ? transactionId : null,
      message: `Subscription created for ${member.name}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/members/:id/subscription
 * Cancel a member's active subscription
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')
  const memberId = context.params.id as string

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  if (!memberId) {
    return errorResponse('Member ID is required', 400)
  }

  try {
    // Get admin person record
    const adminPerson = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!adminPerson) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, adminPerson.id, clubId)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Get member details
    const member = await db
      .prepare(`
        SELECT cm.person_id, p.name
        FROM club_memberships cm
        JOIN people p ON p.id = cm.person_id
        WHERE cm.id = ? AND cm.club_id = ?
      `)
      .bind(memberId, clubId)
      .first<{ person_id: string; name: string }>()

    if (!member) {
      return errorResponse('Member not found', 404)
    }

    // Find active subscription
    const subscription = await db
      .prepare(`
        SELECT id, stripe_subscription_id
        FROM member_subscriptions
        WHERE person_id = ? AND club_id = ? AND status = 'active'
      `)
      .bind(member.person_id, clubId)
      .first<{ id: string; stripe_subscription_id: string | null }>()

    if (!subscription) {
      return errorResponse('No active subscription found', 404)
    }

    // If it's a Stripe subscription, warn but still allow cancel
    if (subscription.stripe_subscription_id) {
      // Note: This will only cancel in our DB, not in Stripe
      // For full Stripe cancellation, use the billing portal
      console.warn(`Cancelling subscription ${subscription.id} which has Stripe ID ${subscription.stripe_subscription_id}. Stripe subscription not cancelled.`)
    }

    // Cancel subscription
    await db
      .prepare(`
        UPDATE member_subscriptions
        SET status = 'cancelled', end_at = datetime('now')
        WHERE id = ?
      `)
      .bind(subscription.id)
      .run()

    return jsonResponse({
      message: `Subscription cancelled for ${member.name}`,
      had_stripe: !!subscription.stripe_subscription_id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
