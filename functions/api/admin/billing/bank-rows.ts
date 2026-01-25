/**
 * Admin Bank Statement Rows Endpoint
 * GET /api/admin/billing/bank-rows - List bank statement rows with match status
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAdmin, AdminContext } from '../../../middleware/admin'

interface BankRow {
  id: string
  import_id: string
  txn_number: string | null
  txn_date: string
  account: string | null
  amount_cents: number
  subcategory: string | null
  memo: string | null
  direction: 'in' | 'out'
  created_at: string
  match: {
    id: string
    transaction_id: string
    match_type: 'auto' | 'manual'
    confidence: number | null
    person_name: string | null
  } | null
  suggestions: MatchSuggestion[]
}

interface MatchSuggestion {
  transaction_id: string
  person_id: string
  person_name: string
  person_email: string
  amount_cents: number
  source: string
  created_at: string
  confidence: number
  reason: string
}

interface BankRowsResponse {
  rows: BankRow[]
  total_count: number
  unmatched_in_count: number
  unmatched_out_count: number
}

export const onRequestGet: PagesFunction<Env> = withAdmin(async (context, admin: AdminContext) => {
  const db = context.env.WWUWH_DB
  const { clubId } = admin

  const url = new URL(context.request.url)
  const importIdParam = url.searchParams.get('import_id')
  const matchedParam = url.searchParams.get('matched') // '0' for unmatched, '1' for matched
  const directionParam = url.searchParams.get('direction') // 'in' or 'out'
  const limitParam = url.searchParams.get('limit')
  const offsetParam = url.searchParams.get('offset')

  const limit = limitParam ? parseInt(limitParam, 10) : 50
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0

  try {
    let query = `
      SELECT
        bsr.id,
        bsr.import_id,
        bsr.txn_number,
        bsr.txn_date,
        bsr.account,
        bsr.amount_cents,
        bsr.subcategory,
        bsr.memo,
        bsr.direction,
        bsr.created_at,
        tm.id as match_id,
        tm.transaction_id,
        tm.match_type,
        tm.confidence,
        p.name as matched_person_name
      FROM bank_statement_rows bsr
      JOIN bank_statement_imports bsi ON bsi.id = bsr.import_id
      LEFT JOIN transaction_matches tm ON tm.bank_row_id = bsr.id
      LEFT JOIN transactions t ON t.id = tm.transaction_id
      LEFT JOIN people p ON p.id = t.person_id
      WHERE bsi.club_id = ?
    `

    const params: (string | number)[] = [clubId]

    if (importIdParam) {
      query += ` AND bsr.import_id = ?`
      params.push(importIdParam)
    }

    if (matchedParam === '0') {
      query += ` AND tm.id IS NULL`
    } else if (matchedParam === '1') {
      query += ` AND tm.id IS NOT NULL`
    }

    if (directionParam) {
      query += ` AND bsr.direction = ?`
      params.push(directionParam)
    }

    // Get total counts
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM bank_statement_rows bsr/,
      'SELECT COUNT(*) as count FROM bank_statement_rows bsr'
    )
    const countResult = await db.prepare(countQuery).bind(...params).first<{ count: number }>()

    // Get unmatched counts
    const unmatchedInCount = await db
      .prepare(`
        SELECT COUNT(*) as count
        FROM bank_statement_rows bsr
        JOIN bank_statement_imports bsi ON bsi.id = bsr.import_id
        LEFT JOIN transaction_matches tm ON tm.bank_row_id = bsr.id
        WHERE bsi.club_id = ? AND tm.id IS NULL AND bsr.direction = 'in'
      `)
      .bind(clubId)
      .first<{ count: number }>()

    const unmatchedOutCount = await db
      .prepare(`
        SELECT COUNT(*) as count
        FROM bank_statement_rows bsr
        JOIN bank_statement_imports bsi ON bsi.id = bsr.import_id
        LEFT JOIN transaction_matches tm ON tm.bank_row_id = bsr.id
        WHERE bsi.club_id = ? AND tm.id IS NULL AND bsr.direction = 'out'
      `)
      .bind(clubId)
      .first<{ count: number }>()

    // Add ordering and pagination
    query += ` ORDER BY bsr.txn_date DESC, bsr.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const result = await db.prepare(query).bind(...params).all<{
      id: string
      import_id: string
      txn_number: string | null
      txn_date: string
      account: string | null
      amount_cents: number
      subcategory: string | null
      memo: string | null
      direction: 'in' | 'out'
      created_at: string
      match_id: string | null
      transaction_id: string | null
      match_type: 'auto' | 'manual' | null
      confidence: number | null
      matched_person_name: string | null
    }>()

    // Build response with suggestions for unmatched 'in' rows
    const rows: BankRow[] = []

    for (const row of result.results) {
      let suggestions: MatchSuggestion[] = []

      // Only generate suggestions for unmatched incoming payments
      if (!row.match_id && row.direction === 'in' && row.amount_cents > 0) {
        suggestions = await generateMatchSuggestions(db, clubId, row)
      }

      rows.push({
        id: row.id,
        import_id: row.import_id,
        txn_number: row.txn_number,
        txn_date: row.txn_date,
        account: row.account,
        amount_cents: row.amount_cents,
        subcategory: row.subcategory,
        memo: row.memo,
        direction: row.direction,
        created_at: row.created_at,
        match: row.match_id ? {
          id: row.match_id,
          transaction_id: row.transaction_id!,
          match_type: row.match_type!,
          confidence: row.confidence,
          person_name: row.matched_person_name,
        } : null,
        suggestions,
      })
    }

    const response: BankRowsResponse = {
      rows,
      total_count: countResult?.count || 0,
      unmatched_in_count: unmatchedInCount?.count || 0,
      unmatched_out_count: unmatchedOutCount?.count || 0,
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * Generate match suggestions for an unmatched bank row
 */
async function generateMatchSuggestions(
  db: D1Database,
  clubId: string,
  row: {
    txn_date: string
    amount_cents: number
    memo: string | null
  }
): Promise<MatchSuggestion[]> {
  const suggestions: MatchSuggestion[] = []

  // Look for unmatched transactions within a week of the bank row date
  const dateWindow = 7
  const minDate = new Date(row.txn_date)
  minDate.setDate(minDate.getDate() - dateWindow)
  const maxDate = new Date(row.txn_date)
  maxDate.setDate(maxDate.getDate() + dateWindow)

  // Find transactions that aren't already matched
  const candidates = await db
    .prepare(`
      SELECT
        t.id as transaction_id,
        t.person_id,
        p.name as person_name,
        p.email as person_email,
        t.amount_cents,
        t.source,
        t.created_at
      FROM transactions t
      JOIN people p ON p.id = t.person_id
      LEFT JOIN transaction_matches tm ON tm.transaction_id = t.id
      WHERE t.club_id = ?
        AND t.type = 'charge'
        AND t.status = 'succeeded'
        AND t.source IN ('cash', 'manual')
        AND tm.id IS NULL
        AND date(COALESCE(t.effective_at, t.created_at)) >= date(?)
        AND date(COALESCE(t.effective_at, t.created_at)) <= date(?)
      ORDER BY t.created_at DESC
      LIMIT 20
    `)
    .bind(clubId, minDate.toISOString().split('T')[0], maxDate.toISOString().split('T')[0])
    .all<{
      transaction_id: string
      person_id: string
      person_name: string
      person_email: string
      amount_cents: number
      source: string
      created_at: string
    }>()

  const memo = (row.memo || '').toLowerCase()

  for (const candidate of candidates.results) {
    let confidence = 0
    const reasons: string[] = []

    // Amount match (high confidence)
    if (candidate.amount_cents === row.amount_cents) {
      confidence += 0.5
      reasons.push('exact amount match')
    } else if (Math.abs(candidate.amount_cents - row.amount_cents) < 100) {
      confidence += 0.2
      reasons.push('similar amount')
    }

    // Name match in memo
    const nameParts = candidate.person_name.toLowerCase().split(' ')
    for (const part of nameParts) {
      if (part.length > 2 && memo.includes(part)) {
        confidence += 0.3
        reasons.push(`name "${part}" found in memo`)
        break
      }
    }

    // Email local part match in memo
    const emailLocal = candidate.person_email.split('@')[0].toLowerCase()
    if (emailLocal.length > 2 && memo.includes(emailLocal)) {
      confidence += 0.2
      reasons.push('email found in memo')
    }

    if (confidence > 0.2) {
      suggestions.push({
        transaction_id: candidate.transaction_id,
        person_id: candidate.person_id,
        person_name: candidate.person_name,
        person_email: candidate.person_email,
        amount_cents: candidate.amount_cents,
        source: candidate.source,
        created_at: candidate.created_at,
        confidence: Math.min(confidence, 1),
        reason: reasons.join(', '),
      })
    }
  }

  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence)

  return suggestions.slice(0, 5)
}
