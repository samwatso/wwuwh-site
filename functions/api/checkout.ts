/**
 * Stripe Checkout Endpoint
 * POST /api/checkout - Create a checkout session for event payment
 *
 * Request body:
 * - event_id: string (required)
 * - success_url: string (optional, defaults to /app/events)
 * - cancel_url: string (optional, defaults to /app/events)
 */

import { Env, jsonResponse, errorResponse } from '../types'
import { withAuth } from '../middleware/auth'
import { createCheckoutSession } from '../lib/stripe'
import { computeEffectiveCategoryAndPrice, formatPricingSummary, type PricingCategory } from '../lib/pricing'

interface CheckoutRequest {
  event_id: string
  success_url?: string
  cancel_url?: string
}

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const stripeKey = context.env.STRIPE_SECRET_KEY

  if (!stripeKey) {
    return errorResponse('Stripe is not configured', 500)
  }

  try {
    const body = await context.request.json() as CheckoutRequest

    if (!body.event_id) {
      return errorResponse('event_id is required', 400)
    }

    // Get user's person record with pricing category
    const person = await db
      .prepare('SELECT id, email, name, pricing_category FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string; email: string; name: string; pricing_category: PricingCategory }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Get event details
    const event = await db
      .prepare('SELECT * FROM events WHERE id = ?')
      .bind(body.event_id)
      .first<{
        id: string
        club_id: string
        title: string
        fee_cents: number | null
        currency: string
        starts_at_utc: string
        payment_mode: string
      }>()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Compute effective pricing based on member's category
    const personCategory = person.pricing_category || 'adult'
    const pricing = await computeEffectiveCategoryAndPrice(db, {
      person_category: personCategory,
      event_id: event.id,
      event_fee_cents: event.fee_cents,
      currency: event.currency,
    })

    // Check if event requires payment
    if (event.payment_mode === 'free' || pricing.amount_cents === 0) {
      return errorResponse('This event is free', 400)
    }

    // Check if already paid
    const existingPayment = await db
      .prepare(`
        SELECT id FROM transactions
        WHERE event_id = ? AND person_id = ? AND status = 'succeeded'
      `)
      .bind(body.event_id, person.id)
      .first()

    if (existingPayment) {
      return errorResponse('You have already paid for this event', 400)
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

    // Format event date for display
    const eventDate = new Date(event.starts_at_utc).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })

    // Determine URLs
    const origin = new URL(context.request.url).origin
    const successUrl = body.success_url || `${origin}/app/events?payment=success`
    const cancelUrl = body.cancel_url || `${origin}/app/events?payment=cancelled`

    // Format description with pricing info
    const pricingSummary = formatPricingSummary(
      event.title,
      pricing.charged_category,
      pricing.amount_cents,
      pricing.currency
    )

    // Create Stripe checkout session with computed price
    const session = await createCheckoutSession(stripeKey, {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: person.email,
      line_items: [
        {
          price_data: {
            currency: pricing.currency.toLowerCase(),
            unit_amount: pricing.amount_cents,
            product_data: {
              name: pricingSummary,
              description: `${eventDate} - WWUWH`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        event_id: event.id,
        person_id: person.id,
        club_id: event.club_id,
        charged_category: pricing.charged_category,
        original_category: pricing.original_category,
      },
    })

    // Create pending transaction record with charged category
    const transactionId = crypto.randomUUID()
    await db
      .prepare(`
        INSERT INTO transactions
        (id, club_id, person_id, event_id, source, type, amount_cents, currency, status, charged_category, stripe_payment_intent_id, created_at)
        VALUES (?, ?, ?, ?, 'stripe', 'charge', ?, ?, 'pending', ?, ?, datetime('now'))
      `)
      .bind(
        transactionId,
        event.club_id,
        person.id,
        event.id,
        pricing.amount_cents,
        pricing.currency,
        pricing.charged_category,
        session.id // We'll update this with the actual payment_intent after webhook
      )
      .run()

    return jsonResponse({
      checkout_url: session.url,
      session_id: session.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout failed'
    console.error('Checkout error:', error)
    return errorResponse(message, 500)
  }
})
