/**
 * Admin Manual Payment Endpoint
 * POST /api/admin/billing/manual-payment - Record a manual payment
 * Requires: billing.view permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'

interface ManualPaymentBody {
  club_id: string
  person_id: string
  event_id?: string | null
  amount_cents: number
  currency?: string
  method: 'cash' | 'bank_transfer' | 'comp'
  occurred_at?: string
  notes?: string
  reference?: string
}

interface ManualPaymentResponse {
  transaction_id: string
  message: string
}

export const onRequestPost: PagesFunction<Env> = withPermission(PERMISSIONS.BILLING_VIEW)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const { clubId, person } = auth

  try {
    const body = await context.request.json() as ManualPaymentBody

    // Validate required fields
    if (!body.person_id) {
      return errorResponse('person_id is required', 400)
    }
    if (typeof body.amount_cents !== 'number' || body.amount_cents <= 0) {
      return errorResponse('amount_cents must be a positive number', 400)
    }
    if (!body.method || !['cash', 'bank_transfer', 'comp'].includes(body.method)) {
      return errorResponse('method must be cash, bank_transfer, or comp', 400)
    }

    // Verify person exists
    const targetPerson = await db
      .prepare('SELECT id, name FROM people WHERE id = ?')
      .bind(body.person_id)
      .first<{ id: string; name: string }>()

    if (!targetPerson) {
      return errorResponse('Person not found', 404)
    }

    // Verify event exists if provided
    if (body.event_id) {
      const event = await db
        .prepare('SELECT id FROM events WHERE id = ? AND club_id = ?')
        .bind(body.event_id, clubId)
        .first()

      if (!event) {
        return errorResponse('Event not found', 404)
      }
    }

    // Map method to source
    const sourceMap: Record<string, string> = {
      cash: 'cash',
      bank_transfer: 'manual',
      comp: 'manual',
    }

    const transactionId = crypto.randomUUID()
    const currency = body.currency || 'GBP'
    const occurredAt = body.occurred_at || new Date().toISOString()

    // Insert transaction
    await db
      .prepare(`
        INSERT INTO transactions (
          id, club_id, person_id, event_id, source, type, amount_cents, currency,
          status, collected_by_person_id, notes, reference, created_at, effective_at
        )
        VALUES (?, ?, ?, ?, ?, 'charge', ?, ?, 'succeeded', ?, ?, ?, datetime('now'), ?)
      `)
      .bind(
        transactionId,
        clubId,
        body.person_id,
        body.event_id || null,
        sourceMap[body.method],
        body.amount_cents,
        currency,
        person.id,
        body.notes || null,
        body.reference || null,
        occurredAt
      )
      .run()

    // If linked to an event with payment request, update recipient status
    if (body.event_id) {
      await db
        .prepare(`
          UPDATE payment_request_recipients
          SET status = 'paid'
          WHERE person_id = ?
            AND payment_request_id IN (
              SELECT id FROM payment_requests
              WHERE event_id = ? AND club_id = ?
            )
            AND status = 'due'
        `)
        .bind(body.person_id, body.event_id, clubId)
        .run()
    }

    const response: ManualPaymentResponse = {
      transaction_id: transactionId,
      message: `Payment of £${(body.amount_cents / 100).toFixed(2)} recorded for ${targetPerson.name}`,
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
