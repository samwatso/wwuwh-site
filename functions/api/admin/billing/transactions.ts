/**
 * Admin Billing Transactions Endpoint
 * GET /api/admin/billing/transactions - List transactions with filters
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAdmin, AdminContext } from '../../../middleware/admin'

interface Transaction {
  id: string
  person_id: string | null
  person_name: string | null
  person_email: string | null
  event_id: string | null
  event_title: string | null
  source: string
  type: string
  amount_cents: number
  currency: string
  status: string
  notes: string | null
  reference: string | null
  collected_by_name: string | null
  created_at: string
  effective_at: string | null
  is_matched: boolean
}

interface TransactionsResponse {
  transactions: Transaction[]
  from: string
  to: string
  total_count: number
}

export const onRequestGet: PagesFunction<Env> = withAdmin(async (context, admin: AdminContext) => {
  const db = context.env.WWUWH_DB
  const { clubId } = admin

  const url = new URL(context.request.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const methodParam = url.searchParams.get('method') // stripe, cash, manual
  const typeParam = url.searchParams.get('type') // charge, refund
  const limitParam = url.searchParams.get('limit')
  const offsetParam = url.searchParams.get('offset')

  // Default to last 90 days
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 90)

  const from = fromParam || defaultFrom.toISOString().split('T')[0]
  const to = toParam || now.toISOString().split('T')[0]
  const limit = limitParam ? parseInt(limitParam, 10) : 100
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0

  try {
    let query = `
      SELECT
        t.id,
        t.person_id,
        p.name as person_name,
        p.email as person_email,
        t.event_id,
        e.title as event_title,
        t.source,
        t.type,
        t.amount_cents,
        t.currency,
        t.status,
        t.notes,
        t.reference,
        collector.name as collected_by_name,
        t.created_at,
        t.effective_at,
        CASE WHEN tm.id IS NOT NULL THEN 1 ELSE 0 END as is_matched
      FROM transactions t
      LEFT JOIN people p ON p.id = t.person_id
      LEFT JOIN events e ON e.id = t.event_id
      LEFT JOIN people collector ON collector.id = t.collected_by_person_id
      LEFT JOIN transaction_matches tm ON tm.transaction_id = t.id
      WHERE t.club_id = ?
        AND date(COALESCE(t.effective_at, t.created_at)) >= date(?)
        AND date(COALESCE(t.effective_at, t.created_at)) <= date(?)
    `

    const params: (string | number)[] = [clubId, from, to]

    if (methodParam) {
      if (methodParam === 'manual') {
        query += ` AND t.source IN ('cash', 'manual')`
      } else {
        query += ` AND t.source = ?`
        params.push(methodParam)
      }
    }

    if (typeParam) {
      query += ` AND t.type = ?`
      params.push(typeParam)
    }

    // Count query
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM transactions t/,
      'SELECT COUNT(*) as count FROM transactions t'
    )
    const countResult = await db.prepare(countQuery).bind(...params).first<{ count: number }>()

    // Add ordering and pagination
    query += ` ORDER BY COALESCE(t.effective_at, t.created_at) DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const result = await db.prepare(query).bind(...params).all<{
      id: string
      person_id: string | null
      person_name: string | null
      person_email: string | null
      event_id: string | null
      event_title: string | null
      source: string
      type: string
      amount_cents: number
      currency: string
      status: string
      notes: string | null
      reference: string | null
      collected_by_name: string | null
      created_at: string
      effective_at: string | null
      is_matched: number
    }>()

    const transactions: Transaction[] = result.results.map(t => ({
      ...t,
      is_matched: t.is_matched === 1,
    }))

    const response: TransactionsResponse = {
      transactions,
      from,
      to,
      total_count: countResult?.count || 0,
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
