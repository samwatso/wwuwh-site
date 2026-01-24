/**
 * Subscription Checkout Endpoint
 * POST /api/subscribe
 *
 * Creates a Stripe Checkout session for subscription sign-up.
 */

import { Env, jsonResponse, errorResponse } from '../types'
import { withAuth } from '../middleware/auth'
import { createCustomer, createSubscriptionCheckout } from '../lib/stripe'

interface SubscribeRequest {
  plan_id: string
  success_url?: string
  cancel_url?: string
}

interface BillingPlan {
  id: string
  club_id: string
  name: string
  stripe_price_id: string | null
}

interface MemberSubscription {
  id: string
  stripe_customer_id: string | null
}

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const stripeKey = context.env.STRIPE_SECRET_KEY

  if (!stripeKey) {
    return errorResponse('Stripe is not configured', 500)
  }

  try {
    const body = await context.request.json() as SubscribeRequest
    const { plan_id, success_url, cancel_url } = body

    if (!plan_id) {
      return errorResponse('plan_id is required', 400)
    }

    // Get person record
    const person = await db
      .prepare('SELECT id, name, email FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string; name: string; email: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Get billing plan
    const plan = await db
      .prepare('SELECT id, club_id, name, stripe_price_id FROM billing_plans WHERE id = ? AND active = 1')
      .bind(plan_id)
      .first<BillingPlan>()

    if (!plan) {
      return errorResponse('Plan not found', 404)
    }

    if (!plan.stripe_price_id) {
      return errorResponse('Plan is not configured for online payment', 400)
    }

    // Check if user is a member of this club
    console.log('Checking membership for club_id:', plan.club_id, 'person_id:', person.id)
    const membership = await db
      .prepare(`
        SELECT id FROM club_memberships
        WHERE club_id = ? AND person_id = ? AND status = 'active'
      `)
      .bind(plan.club_id, person.id)
      .first()

    if (!membership) {
      console.log('No active membership found')
      return errorResponse('You must be a club member to subscribe', 403)
    }
    console.log('Found membership:', membership)

    // Check for existing active subscription
    const existingSub = await db
      .prepare(`
        SELECT id FROM member_subscriptions
        WHERE club_id = ? AND person_id = ? AND status IN ('active', 'past_due')
      `)
      .bind(plan.club_id, person.id)
      .first()

    if (existingSub) {
      return errorResponse('You already have an active subscription. Please manage it from your profile.', 400)
    }

    // Get or create Stripe customer
    let stripeCustomerId: string | null = null

    // Check if user has a previous subscription with a customer ID
    const previousSub = await db
      .prepare(`
        SELECT stripe_customer_id FROM member_subscriptions
        WHERE person_id = ? AND stripe_customer_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      `)
      .bind(person.id)
      .first<MemberSubscription>()

    if (previousSub?.stripe_customer_id) {
      stripeCustomerId = previousSub.stripe_customer_id
      console.log('Using existing Stripe customer:', stripeCustomerId)
    } else {
      // Create new Stripe customer
      console.log('Creating Stripe customer for:', person.email)
      const customer = await createCustomer(stripeKey, {
        email: person.email,
        name: person.name,
        metadata: {
          person_id: person.id,
          club_id: plan.club_id,
        },
      })
      stripeCustomerId = customer.id
      console.log('Created Stripe customer:', stripeCustomerId)
    }

    // Verify we have a customer ID
    if (!stripeCustomerId) {
      return errorResponse('Failed to create or retrieve Stripe customer', 500)
    }

    // Build URLs
    const origin = new URL(context.request.url).origin
    const finalSuccessUrl = success_url || `${origin}/app/subscribe?success=true&plan_id=${plan_id}`
    const finalCancelUrl = cancel_url || `${origin}/app/subscribe?cancelled=true`

    // Create subscription checkout session
    console.log('Creating checkout session with price_id:', plan.stripe_price_id, 'customer:', stripeCustomerId)
    const session = await createSubscriptionCheckout(stripeKey, {
      customer: stripeCustomerId,
      price_id: plan.stripe_price_id,
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      metadata: {
        person_id: person.id,
        club_id: plan.club_id,
        plan_id: plan.id,
      },
    })
    console.log('Created checkout session:', session.id)

    return jsonResponse({
      checkout_url: session.url,
      session_id: session.id,
    })
  } catch (error) {
    console.error('Subscribe error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create checkout'
    return errorResponse(message, 500)
  }
})
