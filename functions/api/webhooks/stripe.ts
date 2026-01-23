/**
 * Stripe Webhook Handler
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events for payment confirmations.
 * This endpoint does NOT require authentication - it's called by Stripe.
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { verifyWebhookSignature, StripeEvent } from '../../lib/stripe'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.WWUWH_DB
  const webhookSecret = context.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured')
    return errorResponse('Webhook not configured', 500)
  }

  try {
    // Get raw body and signature
    const payload = await context.request.text()
    const signature = context.request.headers.get('stripe-signature')

    if (!signature) {
      return errorResponse('Missing signature', 400)
    }

    // Verify webhook signature
    const isValid = await verifyWebhookSignature(payload, signature, webhookSecret)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return errorResponse('Invalid signature', 400)
    }

    // Parse event
    const event = JSON.parse(payload) as StripeEvent
    console.log(`Stripe webhook: ${event.type}`, event.id)

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(db, event.data.object as CheckoutSessionData)
        break

      case 'checkout.session.expired':
        await handleCheckoutExpired(db, event.data.object as CheckoutSessionData)
        break

      case 'payment_intent.succeeded':
        // Payment confirmed - could be used for additional verification
        console.log('Payment intent succeeded:', event.data.object)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(db, event.data.object as PaymentIntentData)
        break

      // Subscription events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(db, event.data.object as SubscriptionData)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(db, event.data.object as SubscriptionData)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(db, event.data.object as SubscriptionData)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(db, event.data.object as InvoiceData)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return jsonResponse({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook error'
    console.error('Webhook error:', error)
    return errorResponse(message, 500)
  }
}

// ============================================
// Event Handlers
// ============================================

interface CheckoutSessionData {
  id: string
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  payment_intent: string | null
  customer_email: string | null
  metadata: {
    event_id?: string
    person_id?: string
    club_id?: string
  }
}

interface PaymentIntentData {
  id: string
  status: string
  metadata: Record<string, string>
}

async function handleCheckoutComplete(db: D1Database, session: CheckoutSessionData) {
  console.log('Checkout complete:', session.id, session.payment_status)

  if (session.payment_status !== 'paid') {
    console.log('Payment not complete, skipping')
    return
  }

  const { event_id, person_id, club_id } = session.metadata

  if (!event_id || !person_id) {
    console.error('Missing metadata in checkout session')
    return
  }

  // Update transaction to succeeded
  await db
    .prepare(`
      UPDATE transactions
      SET status = 'succeeded',
          stripe_payment_intent_id = ?,
          effective_at = datetime('now')
      WHERE event_id = ?
        AND person_id = ?
        AND status = 'pending'
    `)
    .bind(session.payment_intent || session.id, event_id, person_id)
    .run()

  // Auto-RSVP the user as "yes" if they paid
  await db
    .prepare(`
      INSERT INTO event_rsvps (event_id, person_id, response, responded_at, note)
      VALUES (?, ?, 'yes', datetime('now'), 'Auto-RSVP after payment')
      ON CONFLICT (event_id, person_id)
      DO UPDATE SET response = 'yes', responded_at = datetime('now')
    `)
    .bind(event_id, person_id)
    .run()

  // Log to audit
  await db
    .prepare(`
      INSERT INTO audit_log (id, club_id, actor_person_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, ?, ?, 'payment.completed', 'transaction', ?, ?, datetime('now'))
    `)
    .bind(
      crypto.randomUUID(),
      club_id || '',
      person_id,
      session.id,
      JSON.stringify({ event_id, payment_intent: session.payment_intent })
    )
    .run()

  console.log(`Payment recorded for event ${event_id}, person ${person_id}`)
}

async function handleCheckoutExpired(db: D1Database, session: CheckoutSessionData) {
  console.log('Checkout expired:', session.id)

  const { event_id, person_id } = session.metadata

  if (!event_id || !person_id) {
    return
  }

  // Update transaction to cancelled
  await db
    .prepare(`
      UPDATE transactions
      SET status = 'cancelled'
      WHERE event_id = ?
        AND person_id = ?
        AND status = 'pending'
        AND stripe_payment_intent_id = ?
    `)
    .bind(event_id, person_id, session.id)
    .run()
}

async function handlePaymentFailed(db: D1Database, intent: PaymentIntentData) {
  console.log('Payment failed:', intent.id)

  // Update any matching transaction
  await db
    .prepare(`
      UPDATE transactions
      SET status = 'failed'
      WHERE stripe_payment_intent_id = ?
        AND status = 'pending'
    `)
    .bind(intent.id)
    .run()
}

// ============================================
// Subscription Event Handlers
// ============================================

interface SubscriptionData {
  id: string
  customer: string
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'incomplete' | 'paused'
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  canceled_at: number | null
  items: {
    data: Array<{
      price: {
        id: string
        product: string
      }
    }>
  }
  metadata: {
    person_id?: string
    club_id?: string
    plan_id?: string
  }
}

interface InvoiceData {
  id: string
  subscription: string | null
  customer: string
  status: string
}

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
      return 'cancelled'
    case 'paused':
      return 'paused'
    default:
      return 'active'
  }
}

async function handleSubscriptionCreated(db: D1Database, subscription: SubscriptionData) {
  console.log('Subscription created:', subscription.id, subscription.status)

  const { person_id, club_id, plan_id } = subscription.metadata

  if (!person_id || !club_id || !plan_id) {
    console.error('Missing metadata in subscription:', subscription.metadata)
    return
  }

  const status = mapStripeStatus(subscription.status)
  const startAt = new Date(subscription.current_period_start * 1000).toISOString()

  // Check if subscription already exists (idempotency)
  const existing = await db
    .prepare('SELECT id FROM member_subscriptions WHERE stripe_subscription_id = ?')
    .bind(subscription.id)
    .first()

  if (existing) {
    console.log('Subscription already exists, updating status')
    await db
      .prepare(`
        UPDATE member_subscriptions
        SET status = ?, stripe_customer_id = ?
        WHERE stripe_subscription_id = ?
      `)
      .bind(status, subscription.customer, subscription.id)
      .run()
    return
  }

  // Cancel any existing active subscriptions for this user (shouldn't happen, but safety)
  await db
    .prepare(`
      UPDATE member_subscriptions
      SET status = 'cancelled', end_at = datetime('now')
      WHERE club_id = ? AND person_id = ? AND status IN ('active', 'past_due')
    `)
    .bind(club_id, person_id)
    .run()

  // Create new subscription record
  const subId = crypto.randomUUID()
  await db
    .prepare(`
      INSERT INTO member_subscriptions
      (id, club_id, person_id, plan_id, status, start_at, stripe_customer_id, stripe_subscription_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    .bind(subId, club_id, person_id, plan_id, status, startAt, subscription.customer, subscription.id)
    .run()

  // Log to audit
  await db
    .prepare(`
      INSERT INTO audit_log (id, club_id, actor_person_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, ?, ?, 'subscription.created', 'member_subscription', ?, ?, datetime('now'))
    `)
    .bind(
      crypto.randomUUID(),
      club_id,
      person_id,
      subId,
      JSON.stringify({ stripe_subscription_id: subscription.id, plan_id })
    )
    .run()

  console.log(`Subscription created for person ${person_id}, plan ${plan_id}`)
}

async function handleSubscriptionUpdated(db: D1Database, subscription: SubscriptionData) {
  console.log('Subscription updated:', subscription.id, subscription.status)

  const status = mapStripeStatus(subscription.status)

  // Get current subscription from DB
  const existing = await db
    .prepare('SELECT id, plan_id, club_id, person_id FROM member_subscriptions WHERE stripe_subscription_id = ?')
    .bind(subscription.id)
    .first<{ id: string; plan_id: string; club_id: string; person_id: string }>()

  if (!existing) {
    console.log('Subscription not found in database, attempting to create from metadata')
    // Try to create it using metadata
    await handleSubscriptionCreated(db, subscription)
    return
  }

  // Check if plan changed (user upgraded/downgraded)
  const stripePriceId = subscription.items.data[0]?.price.id
  if (stripePriceId) {
    const newPlan = await db
      .prepare('SELECT id FROM billing_plans WHERE stripe_price_id = ?')
      .bind(stripePriceId)
      .first<{ id: string }>()

    if (newPlan && newPlan.id !== existing.plan_id) {
      console.log(`Plan changed from ${existing.plan_id} to ${newPlan.id}`)
      await db
        .prepare('UPDATE member_subscriptions SET plan_id = ? WHERE id = ?')
        .bind(newPlan.id, existing.id)
        .run()
    }
  }

  // Update status
  await db
    .prepare(`
      UPDATE member_subscriptions
      SET status = ?
      WHERE id = ?
    `)
    .bind(status, existing.id)
    .run()

  // If cancelled at period end, log it but don't change status yet
  if (subscription.cancel_at_period_end) {
    console.log('Subscription will cancel at period end')
    await db
      .prepare(`
        INSERT INTO audit_log (id, club_id, actor_person_id, action, entity_type, entity_id, metadata_json, created_at)
        VALUES (?, ?, ?, 'subscription.cancel_scheduled', 'member_subscription', ?, ?, datetime('now'))
      `)
      .bind(
        crypto.randomUUID(),
        existing.club_id,
        existing.person_id,
        existing.id,
        JSON.stringify({ cancel_at_period_end: true })
      )
      .run()
  }
}

async function handleSubscriptionDeleted(db: D1Database, subscription: SubscriptionData) {
  console.log('Subscription deleted:', subscription.id)

  const existing = await db
    .prepare('SELECT id, club_id, person_id FROM member_subscriptions WHERE stripe_subscription_id = ?')
    .bind(subscription.id)
    .first<{ id: string; club_id: string; person_id: string }>()

  if (!existing) {
    console.log('Subscription not found in database')
    return
  }

  // Mark as cancelled
  await db
    .prepare(`
      UPDATE member_subscriptions
      SET status = 'cancelled', end_at = datetime('now')
      WHERE id = ?
    `)
    .bind(existing.id)
    .run()

  // Log to audit
  await db
    .prepare(`
      INSERT INTO audit_log (id, club_id, actor_person_id, action, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, ?, ?, 'subscription.cancelled', 'member_subscription', ?, ?, datetime('now'))
    `)
    .bind(
      crypto.randomUUID(),
      existing.club_id,
      existing.person_id,
      existing.id,
      JSON.stringify({ stripe_subscription_id: subscription.id })
    )
    .run()

  console.log(`Subscription cancelled for person ${existing.person_id}`)
}

async function handleInvoicePaymentFailed(db: D1Database, invoice: InvoiceData) {
  console.log('Invoice payment failed:', invoice.id, 'subscription:', invoice.subscription)

  if (!invoice.subscription) {
    return
  }

  // Mark subscription as past_due
  await db
    .prepare(`
      UPDATE member_subscriptions
      SET status = 'past_due'
      WHERE stripe_subscription_id = ?
    `)
    .bind(invoice.subscription)
    .run()

  console.log(`Subscription ${invoice.subscription} marked as past_due`)
}
