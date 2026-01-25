/**
 * Admin Billing Export Endpoint
 * GET /api/admin/billing/export - Export data as CSV
 */

import { Env, errorResponse } from '../../../types'
import { withAdmin, AdminContext } from '../../../middleware/admin'

type ExportType = 'attendance' | 'subscriptions' | 'event_fees' | 'transactions' | 'members_billing'

function csvResponse(csvContent: string, filename: string): Response {
  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toISOString().split('T')[0]
}

function formatCurrency(cents: number): string {
  return (cents / 100).toFixed(2)
}

export const onRequestGet: PagesFunction<Env> = withAdmin(async (context, admin: AdminContext) => {
  const db = context.env.WWUWH_DB
  const { clubId } = admin

  const url = new URL(context.request.url)
  const exportType = url.searchParams.get('type') as ExportType
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  const eventId = url.searchParams.get('event_id')

  if (!exportType) {
    return errorResponse('type parameter is required', 400)
  }

  const now = new Date()
  const defaultFrom = new Date(now)
  defaultFrom.setDate(defaultFrom.getDate() - 90)

  const from = fromParam || defaultFrom.toISOString().split('T')[0]
  const to = toParam || now.toISOString().split('T')[0]

  try {
    switch (exportType) {
      case 'attendance':
        return await exportAttendance(db, clubId, from, to)

      case 'subscriptions':
        return await exportSubscriptions(db, clubId)

      case 'event_fees':
        return await exportEventFees(db, clubId, from, to, eventId)

      case 'transactions':
        return await exportTransactions(db, clubId, from, to)

      case 'members_billing':
        return await exportMembersBilling(db, clubId)

      default:
        return errorResponse(`Unknown export type: ${exportType}`, 400)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export error'
    return errorResponse(message, 500)
  }
})

async function exportAttendance(
  db: D1Database,
  clubId: string,
  from: string,
  to: string
): Promise<Response> {
  const result = await db
    .prepare(`
      SELECT
        e.title as event_title,
        e.starts_at_utc,
        p.name as person_name,
        p.email,
        er.response,
        ea.status as attendance_status
      FROM events e
      JOIN event_rsvps er ON er.event_id = e.id
      JOIN people p ON p.id = er.person_id
      LEFT JOIN event_attendance ea ON ea.event_id = e.id AND ea.person_id = er.person_id
      WHERE e.club_id = ?
        AND date(e.starts_at_utc) >= date(?)
        AND date(e.starts_at_utc) <= date(?)
      ORDER BY e.starts_at_utc DESC, p.name ASC
    `)
    .bind(clubId, from, to)
    .all<{
      event_title: string
      starts_at_utc: string
      person_name: string
      email: string
      response: string
      attendance_status: string | null
    }>()

  const headers = ['Event', 'Date', 'Name', 'Email', 'RSVP', 'Attendance']
  const rows = result.results.map(r => [
    escapeCSV(r.event_title),
    formatDate(r.starts_at_utc),
    escapeCSV(r.person_name),
    escapeCSV(r.email),
    r.response,
    r.attendance_status || '',
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  return csvResponse(csv, `attendance_${from}_to_${to}.csv`)
}

async function exportSubscriptions(db: D1Database, clubId: string): Promise<Response> {
  const result = await db
    .prepare(`
      SELECT
        p.name,
        p.email,
        bp.name as plan_name,
        bp.price_cents,
        bp.weekly_sessions_allowed,
        ms.status,
        ms.start_at,
        ms.end_at,
        CASE WHEN ms.stripe_subscription_id IS NULL THEN 'Manual' ELSE 'Stripe' END as payment_type,
        COALESCE(ms.is_manual, CASE WHEN ms.stripe_subscription_id IS NULL THEN 1 ELSE 0 END) as is_manual_flag
      FROM member_subscriptions ms
      JOIN people p ON p.id = ms.person_id
      JOIN billing_plans bp ON bp.id = ms.plan_id
      WHERE ms.club_id = ?
        AND ms.status IN ('active', 'past_due')
      ORDER BY p.name ASC
    `)
    .bind(clubId)
    .all<{
      name: string
      email: string
      plan_name: string
      price_cents: number
      weekly_sessions_allowed: number
      status: string
      start_at: string
      end_at: string | null
      payment_type: string
      is_manual_flag: number
    }>()

  const headers = ['Name', 'Email', 'Plan', 'Price (GBP)', 'Sessions/Week', 'Status', 'Payment Type', 'Confirmed/Assumed', 'Start Date', 'End Date']
  const rows = result.results.map(r => [
    escapeCSV(r.name),
    escapeCSV(r.email),
    escapeCSV(r.plan_name),
    formatCurrency(r.price_cents),
    String(r.weekly_sessions_allowed),
    r.status,
    r.payment_type,
    r.is_manual_flag === 1 ? 'Assumed' : 'Confirmed',
    formatDate(r.start_at),
    formatDate(r.end_at),
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  return csvResponse(csv, `subscriptions_${new Date().toISOString().split('T')[0]}.csv`)
}

async function exportEventFees(
  db: D1Database,
  clubId: string,
  from: string,
  to: string,
  eventId?: string | null
): Promise<Response> {
  // Build query based on whether we're filtering by event_id or date range
  let query: string
  let bindings: (string | null)[]
  let filename: string

  if (eventId) {
    // Single event export
    query = `
      SELECT
        e.title as event_title,
        e.starts_at_utc,
        e.fee_cents,
        p.name as person_name,
        p.email,
        prr.status as payment_status,
        COALESCE(prr.amount_cents, pr.amount_cents, e.fee_cents) as amount_cents,
        t.created_at as paid_at,
        t.source as payment_source
      FROM events e
      LEFT JOIN payment_requests pr ON pr.event_id = e.id AND pr.club_id = e.club_id
      LEFT JOIN payment_request_recipients prr ON prr.payment_request_id = pr.id
      LEFT JOIN people p ON p.id = prr.person_id
      LEFT JOIN transactions t ON t.event_id = e.id AND t.person_id = prr.person_id
        AND t.type = 'charge' AND t.status = 'succeeded'
      WHERE e.club_id = ?
        AND e.id = ?
      ORDER BY p.name ASC
    `
    bindings = [clubId, eventId]
    filename = `event_fees_${eventId}.csv`
  } else {
    // Date range export
    query = `
      SELECT
        e.title as event_title,
        e.starts_at_utc,
        e.fee_cents,
        p.name as person_name,
        p.email,
        prr.status as payment_status,
        COALESCE(prr.amount_cents, pr.amount_cents, e.fee_cents) as amount_cents,
        t.created_at as paid_at,
        t.source as payment_source
      FROM events e
      LEFT JOIN payment_requests pr ON pr.event_id = e.id AND pr.club_id = e.club_id
      LEFT JOIN payment_request_recipients prr ON prr.payment_request_id = pr.id
      LEFT JOIN people p ON p.id = prr.person_id
      LEFT JOIN transactions t ON t.event_id = e.id AND t.person_id = prr.person_id
        AND t.type = 'charge' AND t.status = 'succeeded'
      WHERE e.club_id = ?
        AND e.payment_mode = 'one_off'
        AND date(e.starts_at_utc) >= date(?)
        AND date(e.starts_at_utc) <= date(?)
      ORDER BY e.starts_at_utc DESC, p.name ASC
    `
    bindings = [clubId, from, to]
    filename = `event_fees_${from}_to_${to}.csv`
  }

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<{
      event_title: string
      starts_at_utc: string
      fee_cents: number | null
      person_name: string | null
      email: string | null
      payment_status: string | null
      amount_cents: number | null
      paid_at: string | null
      payment_source: string | null
    }>()

  const headers = ['Event', 'Date', 'Name', 'Email', 'Amount (GBP)', 'Status', 'Paid Date', 'Payment Method']
  const rows = result.results.map(r => [
    escapeCSV(r.event_title),
    formatDate(r.starts_at_utc),
    escapeCSV(r.person_name),
    escapeCSV(r.email),
    r.amount_cents ? formatCurrency(r.amount_cents) : '',
    r.payment_status || '',
    formatDate(r.paid_at),
    r.payment_source || '',
  ])

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  return csvResponse(csv, filename)
}

function truncateEvent(title: string | null, maxLength: number): string {
  if (!title) return ''
  if (title.length <= maxLength) return title
  return title.substring(0, maxLength) + '...'
}

async function exportTransactions(
  db: D1Database,
  clubId: string,
  from: string,
  to: string
): Promise<Response> {
  const result = await db
    .prepare(`
      SELECT
        t.id,
        p.name as person_name,
        e.title as event_title,
        t.source,
        t.type,
        t.amount_cents,
        t.status,
        t.notes,
        t.reference,
        t.created_at,
        t.effective_at,
        CASE WHEN tm.id IS NOT NULL THEN 'Yes' ELSE 'No' END as bank_matched
      FROM transactions t
      LEFT JOIN people p ON p.id = t.person_id
      LEFT JOIN events e ON e.id = t.event_id
      LEFT JOIN transaction_matches tm ON tm.transaction_id = t.id
      WHERE t.club_id = ?
        AND date(COALESCE(t.effective_at, t.created_at)) >= date(?)
        AND date(COALESCE(t.effective_at, t.created_at)) <= date(?)
      ORDER BY COALESCE(t.effective_at, t.created_at) ASC
    `)
    .bind(clubId, from, to)
    .all<{
      id: string
      person_name: string | null
      event_title: string | null
      source: string
      type: string
      amount_cents: number
      status: string
      notes: string | null
      reference: string | null
      created_at: string
      effective_at: string | null
      bank_matched: string
    }>()

  // Calculate total
  let totalCents = 0
  result.results.forEach(r => {
    totalCents += r.amount_cents
  })

  // Column order: Event, Name, Amount (GBP), Source, Type, Status, Notes, Reference, Bank Matched, Date, Transaction ID
  const headers = [
    'Event', 'Name', 'Amount (GBP)', 'Source', 'Type', 'Status',
    'Notes', 'Reference', 'Bank Matched', 'Date', 'Transaction ID'
  ]
  const rows = result.results.map(r => [
    escapeCSV(truncateEvent(r.event_title, 25)),
    escapeCSV(r.person_name),
    formatCurrency(r.amount_cents),
    r.source,
    r.type,
    r.status,
    escapeCSV(r.notes),
    escapeCSV(r.reference),
    r.bank_matched,
    formatDate(r.effective_at || r.created_at),
    r.id,
  ])

  // Add total row
  const totalRow = [
    'TOTAL',
    '',
    formatCurrency(totalCents),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]
  rows.push(totalRow)

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  return csvResponse(csv, `transactions_${from}_to_${to}.csv`)
}

async function exportMembersBilling(db: D1Database, clubId: string): Promise<Response> {
  // Get current week boundaries
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  const weekStart = new Date(now.setDate(diff))
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const result = await db
    .prepare(`
      SELECT
        p.name,
        p.email,
        cm.member_type,
        cm.status as membership_status,
        bp.name as plan_name,
        bp.weekly_sessions_allowed,
        ms.status as subscription_status,
        COALESCE(ms.is_manual, CASE WHEN ms.stripe_subscription_id IS NULL AND ms.id IS NOT NULL THEN 1 ELSE 0 END) as is_manual,
        CASE WHEN ms.stripe_subscription_id IS NOT NULL THEN 'Stripe' WHEN ms.id IS NOT NULL THEN 'Manual' ELSE 'None' END as payment_type,
        (
          SELECT COUNT(*)
          FROM event_rsvps er
          JOIN events e ON e.id = er.event_id
          WHERE er.person_id = cm.person_id
            AND er.response = 'yes'
            AND e.club_id = cm.club_id
            AND e.starts_at_utc >= ?
            AND e.starts_at_utc <= ?
        ) as sessions_this_week
      FROM club_memberships cm
      JOIN people p ON p.id = cm.person_id
      LEFT JOIN member_subscriptions ms ON ms.person_id = cm.person_id
        AND ms.club_id = cm.club_id
        AND ms.status IN ('active', 'past_due')
      LEFT JOIN billing_plans bp ON bp.id = ms.plan_id
      WHERE cm.club_id = ?
        AND cm.status = 'active'
      ORDER BY p.name ASC
    `)
    .bind(weekStart.toISOString(), weekEnd.toISOString(), clubId)
    .all<{
      name: string
      email: string
      member_type: string
      membership_status: string
      plan_name: string | null
      weekly_sessions_allowed: number | null
      subscription_status: string | null
      is_manual: number
      payment_type: string
      sessions_this_week: number
    }>()

  const headers = [
    'Name', 'Email', 'Member Type', 'Plan', 'Sessions Allowed/Week',
    'Subscription Status', 'Payment Type', 'Confirmed/Assumed',
    'Sessions This Week', 'Over Limit'
  ]
  const rows = result.results.map(r => {
    const allowed = r.weekly_sessions_allowed || 0
    const overLimit = allowed > 0 && r.sessions_this_week > allowed
    return [
      escapeCSV(r.name),
      escapeCSV(r.email),
      r.member_type,
      escapeCSV(r.plan_name) || 'None',
      String(allowed),
      r.subscription_status || 'None',
      r.payment_type,
      r.is_manual === 1 ? 'Assumed' : 'Confirmed',
      String(r.sessions_this_week),
      overLimit ? 'Yes' : 'No',
    ]
  })

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  return csvResponse(csv, `members_billing_${new Date().toISOString().split('T')[0]}.csv`)
}
