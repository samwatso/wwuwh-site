/**
 * Admin Member Payment Endpoint
 * POST /api/admin/members/:id/payment - Record a manual payment for a member
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface RecordPaymentBody {
  payment_source: 'cash' | 'bacs'
  amount_cents: number
  description?: string
  payment_reference?: string
}

/**
 * POST /api/admin/members/:id/payment
 * Record a manual payment (cash or BACS) for a member
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
    const body = await context.request.json() as RecordPaymentBody

    if (!body.payment_source || !['cash', 'bacs'].includes(body.payment_source)) {
      return errorResponse('payment_source must be cash or bacs', 400)
    }

    if (typeof body.amount_cents !== 'number' || body.amount_cents <= 0) {
      return errorResponse('amount_cents must be a positive number', 400)
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

    // Generate transaction ID
    const transactionId = crypto.randomUUID()

    // Determine source value for DB
    const source = body.payment_source === 'cash' ? 'cash' : 'manual'

    // Create transaction
    await db
      .prepare(`
        INSERT INTO transactions (
          id, club_id, person_id, source, type, amount_cents, currency,
          status, collected_by_person_id, created_at, effective_at
        )
        VALUES (?, ?, ?, ?, 'charge', ?, 'GBP', 'succeeded', ?, datetime('now'), datetime('now'))
      `)
      .bind(
        transactionId,
        clubId,
        member.person_id,
        source,
        body.amount_cents,
        adminPerson.id
      )
      .run()

    return jsonResponse({
      transaction_id: transactionId,
      message: `Payment of ${(body.amount_cents / 100).toFixed(2)} recorded for ${member.name}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
