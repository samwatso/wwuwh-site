/**
 * Event Payment Endpoint
 * GET /api/events/:id/payment - Check if user has paid for an event
 * POST /api/events/:id/payment - Record payment intent (cash/BACS)
 * DELETE /api/events/:id/payment - Cancel payment intent (for cash/BACS only)
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'

interface PaymentRecord {
  id: string
  status: string
  source: string
  amount_cents: number
  currency: string
  reference: string | null
  created_at: string
  effective_at: string | null
}

interface PaymentIntentBody {
  method: 'cash' | 'bank_transfer'
}

// Helper to generate BACS reference (18 chars)
function generateBacsReference(eventTitle: string, userName: string, eventDate: string): string {
  // Clean and shorten event title (6 chars)
  const cleanEvent = eventTitle.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)

  // Clean and shorten user name (6 chars)
  const cleanName = userName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)

  // Format date as DDMMYY (6 chars)
  const date = new Date(eventDate)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  const dateStr = `${dd}${mm}${yy}`

  return `${cleanEvent}${cleanName}${dateStr}`.slice(0, 18)
}

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
  }

  try {
    // Get user's person record
    const person = await db
      .prepare('SELECT id, name FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string; name: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check for payment (any status for cash/BACS, succeeded for stripe)
    const payment = await db
      .prepare(`
        SELECT id, status, source, amount_cents, currency, reference, created_at, effective_at
        FROM transactions
        WHERE event_id = ? AND person_id = ? AND type = 'charge'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(eventId, person.id)
      .first<PaymentRecord>()

    // For cash/BACS, any record counts as "paid" (commitment)
    // For stripe, only succeeded counts
    const isPaid = payment ? (
      payment.source === 'stripe'
        ? payment.status === 'succeeded'
        : ['pending', 'succeeded'].includes(payment.status)
    ) : false

    return jsonResponse({
      paid: isPaid,
      payment: payment || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
  }

  try {
    const body = await context.request.json() as PaymentIntentBody

    if (!body.method || !['cash', 'bank_transfer'].includes(body.method)) {
      return errorResponse('Invalid payment method. Must be "cash" or "bank_transfer"', 400)
    }

    // Get user's person record
    const person = await db
      .prepare('SELECT id, name FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string; name: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Get event details
    const event = await db
      .prepare(`
        SELECT id, club_id, title, fee_cents, currency, starts_at_utc, payment_mode
        FROM events
        WHERE id = ?
      `)
      .bind(eventId)
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

    if (!event.fee_cents || event.fee_cents <= 0) {
      return errorResponse('This event does not require payment', 400)
    }

    // Check if user is a member of the club
    const membership = await db
      .prepare('SELECT id FROM club_memberships WHERE person_id = ? AND club_id = ? AND status = ?')
      .bind(person.id, event.club_id, 'active')
      .first()

    if (!membership) {
      return errorResponse('You must be a member of this club', 403)
    }

    // Check for existing payment
    const existingPayment = await db
      .prepare(`
        SELECT id, source, status
        FROM transactions
        WHERE event_id = ? AND person_id = ? AND type = 'charge'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(eventId, person.id)
      .first<{ id: string; source: string; status: string }>()

    // If stripe payment succeeded, can't change
    if (existingPayment?.source === 'stripe' && existingPayment.status === 'succeeded') {
      return errorResponse('You have already paid via Stripe', 400)
    }

    // Generate reference for BACS
    const reference = body.method === 'bank_transfer'
      ? generateBacsReference(event.title, person.name, event.starts_at_utc)
      : null

    const transactionId = crypto.randomUUID()

    if (existingPayment && existingPayment.status !== 'succeeded') {
      // Update existing pending transaction
      await db
        .prepare(`
          UPDATE transactions
          SET source = ?, reference = ?, status = 'pending'
          WHERE id = ?
        `)
        .bind(body.method, reference, existingPayment.id)
        .run()
    } else if (!existingPayment) {
      // Create new transaction
      await db
        .prepare(`
          INSERT INTO transactions
          (id, club_id, person_id, event_id, source, type, amount_cents, currency, status, reference, created_at)
          VALUES (?, ?, ?, ?, ?, 'charge', ?, ?, 'pending', ?, datetime('now'))
        `)
        .bind(
          transactionId,
          event.club_id,
          person.id,
          eventId,
          body.method,
          event.fee_cents,
          event.currency,
          reference
        )
        .run()
    }

    // Auto-RSVP as 'yes'
    await db
      .prepare(`
        INSERT INTO event_rsvps (event_id, person_id, response, responded_at)
        VALUES (?, ?, 'yes', datetime('now'))
        ON CONFLICT (event_id, person_id)
        DO UPDATE SET response = 'yes', responded_at = datetime('now')
      `)
      .bind(eventId, person.id)
      .run()

    // Get club bank details if BACS
    let bankDetails = null
    if (body.method === 'bank_transfer') {
      const club = await db
        .prepare('SELECT name, bank_account_name, bank_sort_code, bank_account_number FROM clubs WHERE id = ?')
        .bind(event.club_id)
        .first<{
          name: string
          bank_account_name: string | null
          bank_sort_code: string | null
          bank_account_number: string | null
        }>()

      if (club?.bank_sort_code && club?.bank_account_number) {
        bankDetails = {
          account_name: club.bank_account_name || club.name,
          sort_code: club.bank_sort_code,
          account_number: club.bank_account_number,
        }
      }
    }

    return jsonResponse({
      success: true,
      method: body.method,
      reference,
      bank_details: bankDetails,
      amount_cents: event.fee_cents,
      currency: event.currency,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
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

    // Check existing payment
    const existingPayment = await db
      .prepare(`
        SELECT id, source, status
        FROM transactions
        WHERE event_id = ? AND person_id = ? AND type = 'charge'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(eventId, person.id)
      .first<{ id: string; source: string; status: string }>()

    if (!existingPayment) {
      return errorResponse('No payment record found', 404)
    }

    // Can't cancel succeeded stripe payment
    if (existingPayment.source === 'stripe' && existingPayment.status === 'succeeded') {
      return errorResponse('Cannot cancel a completed Stripe payment. Contact admin for refund.', 400)
    }

    // Delete the pending transaction
    await db
      .prepare('DELETE FROM transactions WHERE id = ?')
      .bind(existingPayment.id)
      .run()

    return jsonResponse({
      success: true,
      message: 'Payment intent cancelled',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
