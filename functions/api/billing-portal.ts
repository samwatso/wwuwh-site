/**
 * Billing Portal Endpoint
 * POST /api/billing-portal
 *
 * Creates a Stripe Customer Portal session for managing subscription.
 */

import { Env, jsonResponse, errorResponse } from '../types'
import { withAuth } from '../middleware/auth'
import { createBillingPortalSession } from '../lib/stripe'

interface BillingPortalRequest {
  return_url?: string
}

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const stripeKey = context.env.STRIPE_SECRET_KEY

  if (!stripeKey) {
    return errorResponse('Stripe is not configured', 500)
  }

  try {
    let body: BillingPortalRequest = {}
    try {
      body = await context.request.json()
    } catch {
      // Empty body is OK
    }

    // Get person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Find Stripe customer ID from their subscription
    const subscription = await db
      .prepare(`
        SELECT stripe_customer_id FROM member_subscriptions
        WHERE person_id = ? AND stripe_customer_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      `)
      .bind(person.id)
      .first<{ stripe_customer_id: string }>()

    if (!subscription?.stripe_customer_id) {
      return errorResponse('No billing account found. You need an active subscription first.', 400)
    }

    // Build return URL
    const origin = new URL(context.request.url).origin
    const returnUrl = body.return_url || `${origin}/app/subscribe`

    // Create portal session
    const session = await createBillingPortalSession(stripeKey, {
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    })

    return jsonResponse({
      url: session.url,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create portal session'
    return errorResponse(message, 500)
  }
})
