/**
 * Event Payment Status Endpoint
 * GET /api/events/:id/payment - Check if user has paid for an event
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
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

    // Check for successful payment
    const payment = await db
      .prepare(`
        SELECT id, status, amount_cents, currency, created_at, effective_at
        FROM transactions
        WHERE event_id = ? AND person_id = ? AND type = 'charge'
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .bind(eventId, person.id)
      .first()

    return jsonResponse({
      paid: payment?.status === 'succeeded',
      payment: payment || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
