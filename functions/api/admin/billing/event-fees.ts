/**
 * Admin Billing Event Fees Endpoint
 * GET /api/admin/billing/event-fees - Get events with fee status
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAdmin, AdminContext } from '../../../middleware/admin'

interface EventFeePayer {
  person_id: string
  name: string
  email: string
  status: 'paid' | 'due' | 'waived'
  amount_cents: number
  paid_at: string | null
}

interface EventFeeInfo {
  event_id: string
  title: string
  starts_at_utc: string
  location: string | null
  payment_mode: string
  fee_cents: number | null
  currency: string
  payment_request_id: string | null
  totals: {
    expected_count: number
    paid_count: number
    unpaid_count: number
    waived_count: number
    total_expected_cents: number
    total_collected_cents: number
  }
  payers?: EventFeePayer[]
}

interface EventFeesResponse {
  events: EventFeeInfo[]
  from: string
  to: string
}

export const onRequestGet: PagesFunction<Env> = withAdmin(async (context, admin: AdminContext) => {
  const db = context.env.WWUWH_DB
  const { clubId } = admin

  const url = new URL(context.request.url)
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const includePayersParam = url.searchParams.get('include_payers')

  // Default to last 90 days
  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 90)

  const from = fromParam || defaultFrom.toISOString().split('T')[0]
  const to = toParam || now.toISOString().split('T')[0]
  const includePayers = includePayersParam === 'true'

  try {
    // Get events with one-off payment mode
    const eventsResult = await db
      .prepare(`
        SELECT
          e.id as event_id,
          e.title,
          e.starts_at_utc,
          e.location,
          e.payment_mode,
          e.fee_cents,
          e.currency,
          pr.id as payment_request_id
        FROM events e
        LEFT JOIN payment_requests pr ON pr.event_id = e.id AND pr.club_id = e.club_id
        WHERE e.club_id = ?
          AND e.payment_mode = 'one_off'
          AND date(e.starts_at_utc) >= date(?)
          AND date(e.starts_at_utc) <= date(?)
        ORDER BY e.starts_at_utc DESC
      `)
      .bind(clubId, from, to)
      .all<{
        event_id: string
        title: string
        starts_at_utc: string
        location: string | null
        payment_mode: string
        fee_cents: number | null
        currency: string
        payment_request_id: string | null
      }>()

    // Get payment stats per event
    const events: EventFeeInfo[] = []

    for (const event of eventsResult.results) {
      let totals = {
        expected_count: 0,
        paid_count: 0,
        unpaid_count: 0,
        waived_count: 0,
        total_expected_cents: 0,
        total_collected_cents: 0,
      }
      let payers: EventFeePayer[] | undefined

      if (event.payment_request_id) {
        // Get stats from payment request recipients
        const statsResult = await db
          .prepare(`
            SELECT
              COUNT(*) as total_count,
              SUM(CASE WHEN prr.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN prr.status = 'due' THEN 1 ELSE 0 END) as unpaid_count,
              SUM(CASE WHEN prr.status = 'waived' THEN 1 ELSE 0 END) as waived_count,
              SUM(COALESCE(prr.amount_cents, pr.amount_cents)) as expected_cents
            FROM payment_request_recipients prr
            JOIN payment_requests pr ON pr.id = prr.payment_request_id
            WHERE prr.payment_request_id = ?
          `)
          .bind(event.payment_request_id)
          .first<{
            total_count: number
            paid_count: number
            unpaid_count: number
            waived_count: number
            expected_cents: number
          }>()

        // Get collected amount from transactions
        const collectedResult = await db
          .prepare(`
            SELECT COALESCE(SUM(t.amount_cents), 0) as collected_cents
            FROM transactions t
            WHERE t.event_id = ? AND t.club_id = ?
              AND t.type = 'charge' AND t.status = 'succeeded'
          `)
          .bind(event.event_id, clubId)
          .first<{ collected_cents: number }>()

        totals = {
          expected_count: statsResult?.total_count || 0,
          paid_count: statsResult?.paid_count || 0,
          unpaid_count: statsResult?.unpaid_count || 0,
          waived_count: statsResult?.waived_count || 0,
          total_expected_cents: statsResult?.expected_cents || 0,
          total_collected_cents: collectedResult?.collected_cents || 0,
        }

        if (includePayers) {
          const payersResult = await db
            .prepare(`
              SELECT
                p.id as person_id,
                p.name,
                p.email,
                prr.status,
                COALESCE(prr.amount_cents, pr.amount_cents) as amount_cents,
                t.created_at as paid_at
              FROM payment_request_recipients prr
              JOIN payment_requests pr ON pr.id = prr.payment_request_id
              JOIN people p ON p.id = prr.person_id
              LEFT JOIN transactions t ON t.person_id = prr.person_id
                AND t.event_id = pr.event_id
                AND t.type = 'charge'
                AND t.status = 'succeeded'
              WHERE prr.payment_request_id = ?
              ORDER BY p.name ASC
            `)
            .bind(event.payment_request_id)
            .all<{
              person_id: string
              name: string
              email: string
              status: 'paid' | 'due' | 'waived'
              amount_cents: number
              paid_at: string | null
            }>()

          payers = payersResult.results
        }
      } else {
        // No payment request, get from RSVPs and transactions
        const rsvpCount = await db
          .prepare(`
            SELECT COUNT(*) as count
            FROM event_rsvps
            WHERE event_id = ? AND response = 'yes'
          `)
          .bind(event.event_id)
          .first<{ count: number }>()

        const paidResult = await db
          .prepare(`
            SELECT
              COUNT(DISTINCT t.person_id) as paid_count,
              COALESCE(SUM(t.amount_cents), 0) as collected_cents
            FROM transactions t
            WHERE t.event_id = ? AND t.club_id = ?
              AND t.type = 'charge' AND t.status = 'succeeded'
          `)
          .bind(event.event_id, clubId)
          .first<{ paid_count: number; collected_cents: number }>()

        const expectedCount = rsvpCount?.count || 0
        const paidCount = paidResult?.paid_count || 0

        totals = {
          expected_count: expectedCount,
          paid_count: paidCount,
          unpaid_count: Math.max(0, expectedCount - paidCount),
          waived_count: 0,
          total_expected_cents: expectedCount * (event.fee_cents || 0),
          total_collected_cents: paidResult?.collected_cents || 0,
        }
      }

      events.push({
        event_id: event.event_id,
        title: event.title,
        starts_at_utc: event.starts_at_utc,
        location: event.location,
        payment_mode: event.payment_mode,
        fee_cents: event.fee_cents,
        currency: event.currency,
        payment_request_id: event.payment_request_id,
        totals,
        payers,
      })
    }

    const response: EventFeesResponse = {
      events,
      from,
      to,
    }

    return jsonResponse(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
