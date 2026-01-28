/**
 * Admin Bank Statement Match Endpoint
 * POST /api/admin/billing/bank-match - Match a bank row to a transaction
 * DELETE /api/admin/billing/bank-match - Remove a match
 * Requires: billing.view permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'

interface BankMatchBody {
  club_id: string
  bank_row_id: string
  transaction_id: string
  match_type?: 'auto' | 'manual'
}

interface BankMatchResponse {
  match_id: string
  message: string
}

interface UnmatchBody {
  club_id: string
  match_id?: string
  bank_row_id?: string
}

export const onRequestPost: PagesFunction<Env> = withPermission(PERMISSIONS.BILLING_VIEW)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const { clubId, person } = auth

  try {
    const body = await context.request.json() as BankMatchBody

    if (!body.bank_row_id) {
      return errorResponse('bank_row_id is required', 400)
    }
    if (!body.transaction_id) {
      return errorResponse('transaction_id is required', 400)
    }

    // Verify bank row exists and belongs to this club
    const bankRow = await db
      .prepare(`
        SELECT bsr.id, bsr.amount_cents
        FROM bank_statement_rows bsr
        JOIN bank_statement_imports bsi ON bsi.id = bsr.import_id
        WHERE bsr.id = ? AND bsi.club_id = ?
      `)
      .bind(body.bank_row_id, clubId)
      .first<{ id: string; amount_cents: number }>()

    if (!bankRow) {
      return errorResponse('Bank row not found', 404)
    }

    // Verify transaction exists and belongs to this club
    const transaction = await db
      .prepare(`
        SELECT id, person_id, amount_cents
        FROM transactions
        WHERE id = ? AND club_id = ?
      `)
      .bind(body.transaction_id, clubId)
      .first<{ id: string; person_id: string; amount_cents: number }>()

    if (!transaction) {
      return errorResponse('Transaction not found', 404)
    }

    // Check if either is already matched
    const existingBankMatch = await db
      .prepare('SELECT id FROM transaction_matches WHERE bank_row_id = ?')
      .bind(body.bank_row_id)
      .first()

    if (existingBankMatch) {
      return errorResponse('Bank row is already matched', 409)
    }

    const existingTxnMatch = await db
      .prepare('SELECT id FROM transaction_matches WHERE transaction_id = ?')
      .bind(body.transaction_id)
      .first()

    if (existingTxnMatch) {
      return errorResponse('Transaction is already matched', 409)
    }

    // Calculate confidence based on amount match
    let confidence = 0.5
    if (Math.abs(bankRow.amount_cents) === transaction.amount_cents) {
      confidence = 1.0
    }

    const matchId = crypto.randomUUID()
    const matchType = body.match_type || 'manual'

    await db
      .prepare(`
        INSERT INTO transaction_matches (
          id, club_id, bank_row_id, transaction_id, match_type,
          confidence, created_by_person_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        matchId,
        clubId,
        body.bank_row_id,
        body.transaction_id,
        matchType,
        confidence,
        person.id
      )
      .run()

    const response: BankMatchResponse = {
      match_id: matchId,
      message: 'Match created successfully',
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

export const onRequestDelete: PagesFunction<Env> = withPermission(PERMISSIONS.BILLING_VIEW)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const { clubId } = auth

  try {
    const body = await context.request.json() as UnmatchBody

    if (!body.match_id && !body.bank_row_id) {
      return errorResponse('match_id or bank_row_id is required', 400)
    }

    let matchId = body.match_id

    // If only bank_row_id provided, look up the match
    if (!matchId && body.bank_row_id) {
      const match = await db
        .prepare('SELECT id FROM transaction_matches WHERE bank_row_id = ? AND club_id = ?')
        .bind(body.bank_row_id, clubId)
        .first<{ id: string }>()

      if (!match) {
        return errorResponse('No match found for this bank row', 404)
      }
      matchId = match.id
    }

    // Verify match exists and belongs to this club
    const match = await db
      .prepare('SELECT id FROM transaction_matches WHERE id = ? AND club_id = ?')
      .bind(matchId, clubId)
      .first()

    if (!match) {
      return errorResponse('Match not found', 404)
    }

    await db
      .prepare('DELETE FROM transaction_matches WHERE id = ?')
      .bind(matchId)
      .run()

    return jsonResponse({ success: true, message: 'Match removed successfully' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
