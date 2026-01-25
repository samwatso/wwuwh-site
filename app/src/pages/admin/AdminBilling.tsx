/**
 * AdminBilling Page
 *
 * Comprehensive billing control centre with tabs for:
 * - Overview: Dashboard with totals and income chart
 * - Members: Member billing list with subscription status
 * - Event Fees: One-off event fees with payment tracking
 * - Manual Payments: Record cash/bank payments, import bank statements
 * - Exports: CSV exports for various data
 * - Refunds: Placeholder for future refund workflow
 */

import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { Spinner } from '@/components'
import {
  getBillingOverview,
  getBillingMembers,
  getBillingEventFees,
  getBillingTransactions,
  recordManualPayment,
  importBankStatement,
  getBankRows,
  createBankMatch,
  getBillingExportUrl,
  getAdminMembers,
  getAdminEvents,
  type BillingOverviewResponse,
  type BillingMembersResponse,
  type BillingMember,
  type EventFeesResponse,
  type EventFeeInfo,
  type BillingTransactionsResponse,
  type BillingTransaction,
  type BankRowsResponse,
  type BankRow,
  type BarclaysCSVRow,
  type BillingExportType,
  type AdminMember,
  type AdminEvent,
} from '@/lib/api'
import styles from './AdminBilling.module.css'

type TabId = 'overview' | 'members' | 'event-fees' | 'manual' | 'exports' | 'refunds'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'members', label: 'Members' },
  { id: 'event-fees', label: 'Event Fees' },
  { id: 'manual', label: 'Manual Payments' },
  { id: 'exports', label: 'Exports' },
  { id: 'refunds', label: 'Refunds' },
]

// Utility functions
function formatCurrency(cents: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ============================================
// OVERVIEW TAB
// ============================================

function OverviewTab({ clubId }: { clubId: string }) {
  const [data, setData] = useState<BillingOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [clubId])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const result = await getBillingOverview(clubId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner />
        <p>Loading billing overview...</p>
      </div>
    )
  }

  if (error) {
    return <div className={styles.error}>{error}</div>
  }

  if (!data) return null

  const { totals, subscriptions, chart_data, outstanding_one_off_cents } = data

  // Calculate chart max for scaling
  const chartMax = Math.max(...chart_data.map(d => d.total_cents), 1)

  return (
    <div className={styles.overviewTab}>
      {/* Headline Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statsCard}>
          <div className={styles.statsValue}>
            {formatCurrency(totals.last_30_days.total_collected_cents)}
          </div>
          <div className={styles.statsLabel}>Last 30 Days</div>
          <div className={styles.statsBreakdown}>
            <span>Stripe: {formatCurrency(totals.last_30_days.stripe_collected_cents)}</span>
            <span>Manual: {formatCurrency(totals.last_30_days.manual_collected_cents)}</span>
          </div>
        </div>

        <div className={styles.statsCard}>
          <div className={styles.statsValue}>
            {formatCurrency(totals.month_to_date.total_collected_cents)}
          </div>
          <div className={styles.statsLabel}>Month to Date</div>
          <div className={styles.statsBreakdown}>
            <span>Stripe: {formatCurrency(totals.month_to_date.stripe_collected_cents)}</span>
            <span>Manual: {formatCurrency(totals.month_to_date.manual_collected_cents)}</span>
          </div>
        </div>

        <div className={styles.statsCard}>
          <div className={styles.statsValue}>{subscriptions.active_count}</div>
          <div className={styles.statsLabel}>Active Subscriptions</div>
          <div className={styles.statsBreakdown}>
            <span>{subscriptions.active_count - subscriptions.manual_count} Stripe</span>
            <span>{subscriptions.manual_count} Manual (Assumed)</span>
          </div>
        </div>

        <div className={styles.statsCard}>
          <div className={styles.statsValue}>
            {formatCurrency(outstanding_one_off_cents)}
          </div>
          <div className={styles.statsLabel}>Outstanding One-off</div>
        </div>
      </div>

      {/* Subscriptions by Plan */}
      {subscriptions.by_plan.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Subscriptions by Plan</h3>
          <div className={styles.planList}>
            {subscriptions.by_plan.map(plan => (
              <div key={plan.plan_id} className={styles.planItem}>
                <span className={styles.planName}>{plan.plan_name}</span>
                <span className={styles.planCount}>
                  {plan.count} total
                  {plan.manual_count > 0 && (
                    <span className={styles.assumedBadge}>
                      ({plan.manual_count} assumed)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Income Chart */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Income (Last 30 Days)</h3>
        <div className={styles.chart}>
          <div className={styles.chartBars}>
            {chart_data.map((day, i) => {
              const height = chartMax > 0 ? (day.total_cents / chartMax) * 100 : 0
              const stripeHeight = chartMax > 0 ? (day.stripe_cents / chartMax) * 100 : 0
              return (
                <div
                  key={day.date}
                  className={styles.chartBar}
                  title={`${formatShortDate(day.date)}: ${formatCurrency(day.total_cents)}`}
                >
                  <div className={styles.chartBarStack}>
                    <div
                      className={styles.chartBarManual}
                      style={{ height: `${height}%` }}
                    />
                    <div
                      className={styles.chartBarStripe}
                      style={{ height: `${stripeHeight}%` }}
                    />
                  </div>
                  {i % 7 === 0 && (
                    <div className={styles.chartLabel}>
                      {formatShortDate(day.date)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className={styles.chartLegend}>
            <span className={styles.legendStripe}>Stripe</span>
            <span className={styles.legendManual}>Manual</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// MEMBERS TAB
// ============================================

function MembersTab({ clubId }: { clubId: string }) {
  const [data, setData] = useState<BillingMembersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'past_due' | 'manual' | 'no_plan' | 'over_usage'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [clubId])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const result = await getBillingMembers(clubId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  const filteredMembers = useMemo(() => {
    if (!data) return []
    let result = data.members

    // Apply search
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        m => m.name.toLowerCase().includes(searchLower) ||
             m.email.toLowerCase().includes(searchLower)
      )
    }

    // Apply filter
    switch (filter) {
      case 'past_due':
        result = result.filter(m => m.payment_health.past_due)
        break
      case 'manual':
        result = result.filter(m => m.payment_health.assumed_paid)
        break
      case 'no_plan':
        result = result.filter(m => !m.subscription)
        break
      case 'over_usage':
        result = result.filter(m =>
          m.subscription &&
          m.usage_this_week.attended_count > m.usage_this_week.allowed
        )
        break
    }

    return result
  }, [data, filter, search])

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner />
        <p>Loading members...</p>
      </div>
    )
  }

  if (error) {
    return <div className={styles.error}>{error}</div>
  }

  if (!data) return null

  return (
    <div className={styles.membersTab}>
      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <input
            type="text"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.filterTabs}>
          {[
            { id: 'all', label: 'All' },
            { id: 'past_due', label: 'Past Due' },
            { id: 'manual', label: 'Manual (Assumed)' },
            { id: 'no_plan', label: 'No Plan' },
            { id: 'over_usage', label: 'Over Limit' },
          ].map(f => (
            <button
              key={f.id}
              className={`${styles.filterTab} ${filter === f.id ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(f.id as typeof filter)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Week info */}
      <div className={styles.weekInfo}>
        Week of {formatDate(data.week_start)} to {formatDate(data.week_end)}
      </div>

      {/* Member List */}
      <div className={styles.membersList}>
        {filteredMembers.length === 0 ? (
          <div className={styles.empty}>No members match your filters</div>
        ) : (
          filteredMembers.map(member => (
            <MemberRow key={member.person_id} member={member} />
          ))
        )}
      </div>
    </div>
  )
}

function MemberRow({ member }: { member: BillingMember }) {
  const { subscription, usage_this_week, payment_health } = member

  const statusBadge = payment_health.past_due
    ? styles.badgePastDue
    : payment_health.assumed_paid
    ? styles.badgeAssumed
    : subscription
    ? styles.badgeConfirmed
    : styles.badgeNone

  const statusText = payment_health.past_due
    ? 'Past Due'
    : payment_health.assumed_paid
    ? 'Assumed'
    : subscription
    ? 'Confirmed'
    : 'No Plan'

  const isOverLimit = subscription && usage_this_week.attended_count > usage_this_week.allowed

  return (
    <div className={styles.memberRow}>
      <div className={styles.memberInfo}>
        <div className={styles.memberName}>{member.name}</div>
        <div className={styles.memberEmail}>{member.email}</div>
      </div>

      <div className={styles.memberPlan}>
        {subscription ? (
          <>
            <span className={styles.planBadge}>{subscription.plan_name}</span>
            <span className={styles.planSessions}>
              {subscription.weekly_sessions_allowed}/week
            </span>
          </>
        ) : (
          <span className={styles.noPlan}>No subscription</span>
        )}
      </div>

      <div className={styles.memberUsage}>
        <span className={`${styles.usagePill} ${isOverLimit ? styles.usageOver : ''}`}>
          {usage_this_week.attended_count}/{usage_this_week.allowed || '∞'}
        </span>
      </div>

      <div className={styles.memberStatus}>
        <span className={`${styles.badge} ${statusBadge}`}>{statusText}</span>
      </div>

      <Link
        to={`/app/admin/members?person=${member.person_id}`}
        className={styles.memberAction}
      >
        View
      </Link>
    </div>
  )
}

// ============================================
// EVENT FEES TAB
// ============================================

function EventFeesTab({ clubId }: { clubId: string }) {
  const [data, setData] = useState<EventFeesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventFeeInfo | null>(null)

  useEffect(() => {
    loadData()
  }, [clubId])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const result = await getBillingEventFees(clubId)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event fees')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner />
        <p>Loading event fees...</p>
      </div>
    )
  }

  if (error) {
    return <div className={styles.error}>{error}</div>
  }

  if (!data) return null

  return (
    <div className={styles.eventFeesTab}>
      {data.events.length === 0 ? (
        <div className={styles.empty}>No events with one-off fees in the last 90 days</div>
      ) : (
        <div className={styles.eventsList}>
          {data.events.map(event => (
            <EventFeeCard
              key={event.event_id}
              event={event}
              onSelect={() => setSelectedEvent(event)}
            />
          ))}
        </div>
      )}

      {selectedEvent && (
        <EventFeeDetailModal
          event={selectedEvent}
          clubId={clubId}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

function EventFeeCard({
  event,
  onSelect,
}: {
  event: EventFeeInfo
  onSelect: () => void
}) {
  const { totals } = event
  const collectionRate = totals.expected_count > 0
    ? Math.round((totals.paid_count / totals.expected_count) * 100)
    : 0

  return (
    <div className={styles.eventCard}>
      <div className={styles.eventHeader}>
        <div className={styles.eventTitle}>{event.title}</div>
        <div className={styles.eventDate}>{formatDate(event.starts_at_utc)}</div>
      </div>

      <div className={styles.eventStats}>
        <div className={styles.eventStat}>
          <span className={styles.eventStatValue}>
            {formatCurrency(event.fee_cents || 0)}
          </span>
          <span className={styles.eventStatLabel}>Fee</span>
        </div>
        <div className={styles.eventStat}>
          <span className={styles.eventStatValue}>
            {totals.paid_count}/{totals.expected_count}
          </span>
          <span className={styles.eventStatLabel}>Paid</span>
        </div>
        <div className={styles.eventStat}>
          <span className={styles.eventStatValue}>
            {formatCurrency(totals.total_collected_cents)}
          </span>
          <span className={styles.eventStatLabel}>Collected</span>
        </div>
        <div className={styles.eventStat}>
          <span className={styles.eventStatValue}>{collectionRate}%</span>
          <span className={styles.eventStatLabel}>Rate</span>
        </div>
      </div>

      <div className={styles.eventActions}>
        <button className={styles.btnSecondary} onClick={onSelect}>
          View Details
        </button>
        <ExportPNGButton event={event} />
      </div>
    </div>
  )
}

function EventFeeDetailModal({
  event,
  clubId,
  onClose,
}: {
  event: EventFeeInfo
  clubId: string
  onClose: () => void
}) {
  const [eventWithPayers, setEventWithPayers] = useState<EventFeeInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPayers()
  }, [event.event_id])

  async function loadPayers() {
    setLoading(true)
    try {
      const result = await getBillingEventFees(clubId, undefined, undefined, true)
      const found = result.events.find(e => e.event_id === event.event_id)
      setEventWithPayers(found || event)
    } catch (err) {
      setEventWithPayers(event)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{event.title}</h2>
          <button className={styles.modalClose} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.loading}>
              <Spinner />
            </div>
          ) : eventWithPayers?.payers ? (
            <div className={styles.payersList}>
              {eventWithPayers.payers.map(payer => (
                <div key={payer.person_id} className={styles.payerRow}>
                  <div className={styles.payerInfo}>
                    <div className={styles.payerName}>{payer.name}</div>
                    <div className={styles.payerEmail}>{payer.email}</div>
                  </div>
                  <div className={styles.payerAmount}>
                    {formatCurrency(payer.amount_cents)}
                  </div>
                  <div className={styles.payerStatus}>
                    <span className={`${styles.badge} ${
                      payer.status === 'paid' ? styles.badgeConfirmed :
                      payer.status === 'waived' ? styles.badgeAssumed :
                      styles.badgePastDue
                    }`}>
                      {payer.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>No payment details available</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ExportPNGButton({ event }: { event: EventFeeInfo }) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      // Create a temporary element for rendering
      const el = document.createElement('div')
      el.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        background: white;
        padding: 32px;
        width: 400px;
        font-family: system-ui, -apple-system, sans-serif;
      `
      el.innerHTML = `
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #1e2b60;">${event.title}</h2>
        <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px;">${formatDate(event.starts_at_utc)}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
          <div style="background: #f5f7fb; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 600; color: #1e2b60;">${formatCurrency(event.fee_cents || 0)}</div>
            <div style="font-size: 12px; color: #6b7280;">Fee per person</div>
          </div>
          <div style="background: #f5f7fb; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 600; color: #1e2b60;">${event.totals.paid_count}/${event.totals.expected_count}</div>
            <div style="font-size: 12px; color: #6b7280;">Paid</div>
          </div>
        </div>
        <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center;">
          <div style="font-size: 28px; font-weight: 600; color: #16a34a;">${formatCurrency(event.totals.total_collected_cents)}</div>
          <div style="font-size: 12px; color: #6b7280;">Total Collected</div>
        </div>
        <p style="margin: 16px 0 0; text-align: center; font-size: 11px; color: #9ca3af;">
          Generated ${new Date().toLocaleDateString('en-GB')}
        </p>
      `
      document.body.appendChild(el)

      // Use html-to-image if available, otherwise fallback to canvas
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(el)

      // Download
      const link = document.createElement('a')
      link.download = `${event.title.replace(/\s+/g, '_')}_fees.png`
      link.href = dataUrl
      link.click()

      document.body.removeChild(el)
    } catch (err) {
      console.error('PNG export failed:', err)
      alert('PNG export failed. Try again or use browser print.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <button
      className={styles.btnSecondary}
      onClick={handleExport}
      disabled={exporting}
    >
      {exporting ? 'Exporting...' : 'Export PNG'}
    </button>
  )
}

// ============================================
// MANUAL PAYMENTS TAB
// ============================================

function ManualPaymentsTab({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState<'record' | 'transactions' | 'bank'>('record')

  return (
    <div className={styles.manualPaymentsTab}>
      <div className={styles.subTabs}>
        <button
          className={`${styles.subTab} ${tab === 'record' ? styles.subTabActive : ''}`}
          onClick={() => setTab('record')}
        >
          Record Payment
        </button>
        <button
          className={`${styles.subTab} ${tab === 'transactions' ? styles.subTabActive : ''}`}
          onClick={() => setTab('transactions')}
        >
          Transactions
        </button>
        <button
          className={`${styles.subTab} ${tab === 'bank' ? styles.subTabActive : ''}`}
          onClick={() => setTab('bank')}
        >
          Bank Import
        </button>
      </div>

      {tab === 'record' && <RecordPaymentSection clubId={clubId} />}
      {tab === 'transactions' && <TransactionsSection clubId={clubId} />}
      {tab === 'bank' && <BankImportSection clubId={clubId} />}
    </div>
  )
}

function RecordPaymentSection({ clubId }: { clubId: string }) {
  const [members, setMembers] = useState<AdminMember[]>([])
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [personId, setPersonId] = useState('')
  const [eventId, setEventId] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'comp'>('cash')
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [clubId])

  async function loadData() {
    setLoadingData(true)
    try {
      const [membersRes, eventsRes] = await Promise.all([
        getAdminMembers({ club_id: clubId }),
        getAdminEvents({ club_id: clubId, limit: 50 }),
      ])
      setMembers(membersRes.members)
      setEvents(eventsRes.events)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoadingData(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!personId) {
      setMessage({ type: 'error', text: 'Please select a member' })
      return
    }
    const amountCents = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const result = await recordManualPayment({
        club_id: clubId,
        person_id: personId,
        event_id: eventId || undefined,
        amount_cents: amountCents,
        method,
        notes: notes || undefined,
        reference: reference || undefined,
      })
      setMessage({ type: 'success', text: result.message })
      // Reset form
      setPersonId('')
      setEventId('')
      setAmount('')
      setNotes('')
      setReference('')
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to record payment' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingData) {
    return (
      <div className={styles.loading}>
        <Spinner />
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className={styles.recordPaymentSection}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {message && (
          <div className={`${styles.message} ${message.type === 'error' ? styles.messageError : styles.messageSuccess}`}>
            {message.text}
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Member *</label>
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className={styles.formSelect}
            required
          >
            <option value="">Select member...</option>
            {members.map(m => (
              <option key={m.person_id} value={m.person_id}>{m.name} ({m.email})</option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Event (optional)</label>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className={styles.formSelect}
          >
            <option value="">No specific event</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({formatDate(ev.starts_at_utc)})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Amount (GBP) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={styles.formInput}
              placeholder="0.00"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Method *</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className={styles.formSelect}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="comp">Comp/Free</option>
            </select>
          </div>
        </div>

        {method === 'bank_transfer' && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={styles.formInput}
              placeholder="Bank transfer reference..."
            />
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={styles.formTextarea}
            rows={2}
            placeholder="Additional notes..."
          />
        </div>

        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={submitting}
        >
          {submitting ? 'Recording...' : 'Record Payment'}
        </button>
      </form>
    </div>
  )
}

function TransactionsSection({ clubId }: { clubId: string }) {
  const [data, setData] = useState<BillingTransactionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [methodFilter, setMethodFilter] = useState<'all' | 'stripe' | 'manual'>('all')

  useEffect(() => {
    loadData()
  }, [clubId, methodFilter])

  async function loadData() {
    setLoading(true)
    try {
      const result = await getBillingTransactions(clubId, {
        method: methodFilter === 'all' ? undefined : methodFilter,
        limit: 50,
      })
      setData(result)
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    )
  }

  return (
    <div className={styles.transactionsSection}>
      <div className={styles.filterTabs}>
        <button
          className={`${styles.filterTab} ${methodFilter === 'all' ? styles.filterTabActive : ''}`}
          onClick={() => setMethodFilter('all')}
        >
          All
        </button>
        <button
          className={`${styles.filterTab} ${methodFilter === 'stripe' ? styles.filterTabActive : ''}`}
          onClick={() => setMethodFilter('stripe')}
        >
          Stripe
        </button>
        <button
          className={`${styles.filterTab} ${methodFilter === 'manual' ? styles.filterTabActive : ''}`}
          onClick={() => setMethodFilter('manual')}
        >
          Manual
        </button>
      </div>

      {data?.transactions.length === 0 ? (
        <div className={styles.empty}>No transactions found</div>
      ) : (
        <div className={styles.transactionsList}>
          {data?.transactions.map(txn => (
            <TransactionRow key={txn.id} transaction={txn} />
          ))}
        </div>
      )}
    </div>
  )
}

function TransactionRow({ transaction }: { transaction: BillingTransaction }) {
  return (
    <div className={styles.transactionRow}>
      <div className={styles.transactionInfo}>
        <div className={styles.transactionPerson}>
          {transaction.person_name || 'Unknown'}
        </div>
        {transaction.event_title && (
          <div className={styles.transactionEvent}>{transaction.event_title}</div>
        )}
      </div>
      <div className={styles.transactionAmount}>
        {transaction.type === 'refund' ? '-' : ''}
        {formatCurrency(transaction.amount_cents)}
      </div>
      <div className={styles.transactionMeta}>
        <span className={`${styles.badge} ${
          transaction.source === 'stripe' ? styles.badgeStripe :
          transaction.source === 'cash' ? styles.badgeCash :
          styles.badgeManual
        }`}>
          {transaction.source}
        </span>
        {transaction.is_matched && (
          <span className={`${styles.badge} ${styles.badgeMatched}`}>Matched</span>
        )}
      </div>
      <div className={styles.transactionDate}>
        {formatDate(transaction.effective_at || transaction.created_at)}
      </div>
    </div>
  )
}

// ============================================
// BANK IMPORT SECTION
// ============================================

function BankImportSection({ clubId }: { clubId: string }) {
  const [bankRows, setBankRows] = useState<BankRowsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<BarclaysCSVRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [showReconcile, setShowReconcile] = useState(false)

  useEffect(() => {
    loadBankRows()
  }, [clubId])

  async function loadBankRows() {
    setLoading(true)
    try {
      const result = await getBankRows(clubId, { matched: '0', direction: 'in', limit: 50 })
      setBankRows(result)
    } catch (err) {
      console.error('Failed to load bank rows:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    setImportMessage(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const rows = parseBarclaysCSV(text)
      setParsedRows(rows)
    }
    reader.readAsText(file)
  }

  function parseBarclaysCSV(text: string): BarclaysCSVRow[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim())
    const rows: BarclaysCSVRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      if (values.length >= 6) {
        rows.push({
          Number: values[headers.indexOf('Number')] || '',
          Date: values[headers.indexOf('Date')] || '',
          Account: values[headers.indexOf('Account')] || '',
          Amount: values[headers.indexOf('Amount')] || '',
          Subcategory: values[headers.indexOf('Subcategory')] || '',
          Memo: values[headers.indexOf('Memo')] || '',
        })
      }
    }

    return rows
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  async function handleImport() {
    if (!importFile || parsedRows.length === 0) return

    setImporting(true)
    setImportMessage(null)

    try {
      const result = await importBankStatement({
        club_id: clubId,
        filename: importFile.name,
        rows: parsedRows,
      })
      setImportMessage(`Imported ${result.inserted} rows (${result.skipped_duplicates} duplicates skipped)`)
      setImportFile(null)
      setParsedRows([])
      loadBankRows()
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={styles.bankImportSection}>
      {/* Import Card */}
      <div className={styles.importCard}>
        <h3 className={styles.cardTitle}>Import Barclays CSV</h3>
        <p className={styles.cardDesc}>
          Upload a CSV export from Barclays online banking to import transactions.
        </p>

        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className={styles.fileInput}
        />

        {parsedRows.length > 0 && (
          <div className={styles.previewSection}>
            <p className={styles.previewCount}>
              {parsedRows.length} rows found
            </p>
            <div className={styles.previewTable}>
              <div className={styles.previewHeader}>
                <span>Date</span>
                <span>Amount</span>
                <span>Memo</span>
              </div>
              {parsedRows.slice(0, 5).map((row, i) => (
                <div key={i} className={styles.previewRow}>
                  <span>{row.Date}</span>
                  <span>{row.Amount}</span>
                  <span className={styles.memoCell}>{row.Memo}</span>
                </div>
              ))}
              {parsedRows.length > 5 && (
                <div className={styles.previewMore}>
                  ... and {parsedRows.length - 5} more rows
                </div>
              )}
            </div>
            <button
              className={styles.btnPrimary}
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Import Rows'}
            </button>
          </div>
        )}

        {importMessage && (
          <div className={styles.importMessage}>{importMessage}</div>
        )}
      </div>

      {/* Reconciliation Section */}
      <div className={styles.reconcileCard}>
        <h3 className={styles.cardTitle}>Reconcile Payments</h3>
        {loading ? (
          <div className={styles.loading}><Spinner /></div>
        ) : bankRows && bankRows.unmatched_in_count > 0 ? (
          <>
            <p className={styles.cardDesc}>
              {bankRows.unmatched_in_count} unmatched incoming payments to reconcile
            </p>
            <button
              className={styles.btnSecondary}
              onClick={() => setShowReconcile(true)}
            >
              Start Reconciliation
            </button>
          </>
        ) : (
          <p className={styles.cardDesc}>
            No unmatched incoming payments. Import a bank statement to begin.
          </p>
        )}
      </div>

      {showReconcile && bankRows && (
        <ReconcileModal
          clubId={clubId}
          rows={bankRows.rows}
          onClose={() => {
            setShowReconcile(false)
            loadBankRows()
          }}
        />
      )}
    </div>
  )
}

function ReconcileModal({
  clubId,
  rows,
  onClose,
}: {
  clubId: string
  rows: BankRow[]
  onClose: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [matching, setMatching] = useState(false)
  const unmatchedRows = rows.filter(r => !r.match && r.direction === 'in')
  const currentRow = unmatchedRows[currentIndex]

  async function handleMatch(transactionId: string) {
    if (!currentRow) return
    setMatching(true)
    try {
      await createBankMatch({
        club_id: clubId,
        bank_row_id: currentRow.id,
        transaction_id: transactionId,
      })
      // Move to next
      if (currentIndex < unmatchedRows.length - 1) {
        setCurrentIndex(currentIndex + 1)
      } else {
        onClose()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to match')
    } finally {
      setMatching(false)
    }
  }

  function handleSkip() {
    if (currentIndex < unmatchedRows.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      onClose()
    }
  }

  if (!currentRow) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>Reconciliation Complete</h2>
            <button className={styles.modalClose} onClick={onClose}>&times;</button>
          </div>
          <div className={styles.modalBody}>
            <p>All incoming payments have been processed.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalWide}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            Reconcile Payment ({currentIndex + 1}/{unmatchedRows.length})
          </h2>
          <button className={styles.modalClose} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.modalBody}>
          {/* Bank Row Details */}
          <div className={styles.bankRowDetail}>
            <div className={styles.bankRowAmount}>
              {formatCurrency(Math.abs(currentRow.amount_cents))}
            </div>
            <div className={styles.bankRowDate}>{currentRow.txn_date}</div>
            <div className={styles.bankRowMemo}>{currentRow.memo || 'No memo'}</div>
          </div>

          {/* Suggestions */}
          <h4 className={styles.suggestionsTitle}>Match Suggestions</h4>
          {currentRow.suggestions.length === 0 ? (
            <p className={styles.noSuggestions}>
              No automatic matches found. You can skip this row or manually select a transaction.
            </p>
          ) : (
            <div className={styles.suggestionsList}>
              {currentRow.suggestions.map(suggestion => (
                <div key={suggestion.transaction_id} className={styles.suggestionRow}>
                  <div className={styles.suggestionInfo}>
                    <div className={styles.suggestionPerson}>{suggestion.person_name}</div>
                    <div className={styles.suggestionAmount}>
                      {formatCurrency(suggestion.amount_cents)}
                    </div>
                    <div className={styles.suggestionReason}>{suggestion.reason}</div>
                  </div>
                  <div className={styles.suggestionConfidence}>
                    {Math.round(suggestion.confidence * 100)}%
                  </div>
                  <button
                    className={styles.btnPrimary}
                    onClick={() => handleMatch(suggestion.transaction_id)}
                    disabled={matching}
                  >
                    Match
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={handleSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// EXPORTS TAB
// ============================================

// PDF Export Types
interface PDFExportData {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

// Helper to format date as dd-mm-yyyy
function formatDatePDF(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

// Transform transaction data for PDF - format values for display
// CSV already has correct column order and total row
function transformTransactionsForPDF(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  // Find the Date column index
  const dateColIndex = headers.findIndex(h => h === 'Date')

  // Transform rows - just format dates to dd-mm-yyyy
  const newRows = rows.map(row => {
    return row.map((value, colIndex) => {
      // Format date column
      if (colIndex === dateColIndex && value && value !== '') {
        return formatDatePDF(value)
      }
      return value
    })
  })

  return { headers, rows: newRows }
}

// Transform event fees data for PDF
function transformEventFeesForPDF(
  headers: string[],
  rows: string[][]
): { headers: string[]; rows: string[][] } {
  // Columns to keep in desired order: Name, Amount (GBP), Status, Paid Date, Payment Method
  const keepColumns = ['Name', 'Amount (GBP)', 'Status', 'Paid Date', 'Payment Method']

  // Find indices of columns to keep
  const indices = keepColumns.map(col => headers.findIndex(h => h === col))

  // Filter headers
  const newHeaders = keepColumns.filter((_, i) => indices[i] !== -1)
  const validIndices = indices.filter(i => i !== -1)

  // Track total amount
  let totalAmount = 0
  const amountColIndex = newHeaders.indexOf('Amount (GBP)')

  // Transform rows
  const newRows = rows.map(row => {
    return validIndices.map((colIndex, newColIndex) => {
      const value = row[colIndex] || ''
      const colName = newHeaders[newColIndex]

      if (colName === 'Amount (GBP)') {
        // Parse amount and add to total
        const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''))
        if (!isNaN(numericValue)) {
          totalAmount += numericValue
        }
      }
      if (colName === 'Paid Date') {
        return formatDatePDF(value)
      }
      return value
    })
  })

  // Add total row at the bottom
  if (newRows.length > 0 && amountColIndex !== -1) {
    const totalRow = newHeaders.map((col, idx) => {
      if (idx === 0) return 'TOTAL'
      if (col === 'Amount (GBP)') return totalAmount.toFixed(2)
      return ''
    })
    newRows.push(totalRow)
  }

  return { headers: newHeaders, rows: newRows }
}

interface PDFOptions {
  orientation?: 'portrait' | 'landscape'
  subtitle?: string
}

async function generatePDF(
  data: PDFExportData,
  clubName: string,
  dateRange: { from: string; to: string },
  options: PDFOptions = {}
) {
  const jsPDFModule = await import('jspdf')
  const jsPDF = jsPDFModule.default
  const autoTable = (await import('jspdf-autotable')).default

  const orientation = options.orientation || 'landscape'

  // Create PDF with specified orientation
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Load logo
  let logoLoaded = false
  try {
    const logoImg = new Image()
    logoImg.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve()
      logoImg.onerror = () => reject()
      logoImg.src = '/app/assets/logo.png'
    })

    // Add logo (left side of header)
    const logoHeight = 15
    const logoWidth = logoHeight * (logoImg.width / logoImg.height)
    doc.addImage(logoImg, 'PNG', 15, 10, logoWidth, logoHeight)
    logoLoaded = true
  } catch {
    // Logo failed to load, continue without it
    console.warn('Logo failed to load')
  }

  // Header text
  const headerX = logoLoaded ? 50 : 15
  doc.setFontSize(18)
  doc.setTextColor(30, 43, 96) // Navy color
  doc.text(clubName, headerX, 18)

  doc.setFontSize(12)
  doc.setTextColor(107, 114, 128) // Grey
  doc.text(data.title, headerX, 25)

  // Subtitle if provided (for event name)
  if (options.subtitle) {
    doc.setFontSize(10)
    doc.text(options.subtitle, headerX, 31)
  }

  // Date/event info (right side)
  doc.setFontSize(10)
  if (dateRange.from === dateRange.to) {
    // Single date (for event exports)
    doc.text(formatDate(dateRange.from), pageWidth - 15, 18, { align: 'right' })
  } else {
    doc.text(`${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`, pageWidth - 15, 18, { align: 'right' })
  }
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - 15, 24, { align: 'right' })

  // Divider line - position depends on whether subtitle exists
  const dividerY = options.subtitle ? 36 : 30
  const tableStartY = options.subtitle ? 41 : 35
  doc.setDrawColor(215, 220, 232)
  doc.line(15, dividerY, pageWidth - 15, dividerY)

  // Table
  autoTable(doc, {
    head: [data.headers],
    body: data.rows.map(row => row.map(cell => String(cell))),
    startY: tableStartY,
    margin: { left: 15, right: 15 },
    headStyles: {
      fillColor: [30, 43, 96], // Navy
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [43, 47, 58],
    },
    alternateRowStyles: {
      fillColor: [245, 247, 251],
    },
    styles: {
      cellPadding: 2,
      lineColor: [215, 220, 232],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    // Footer with page numbers
    didDrawPage: (pageData) => {
      const pageCount = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(107, 114, 128)
      doc.text(
        `Page ${pageData.pageNumber} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      )
    },
  })

  return doc
}

function ExportsTab({ clubId }: { clubId: string }) {
  const { memberships } = useProfile()
  const clubName = memberships[0]?.club_name || 'Club'

  // Date range state
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0])
  const [exporting, setExporting] = useState<string | null>(null)

  // Event selection state for event fees
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string>('')

  // Load events with one-off fees
  useEffect(() => {
    loadEvents()
  }, [clubId])

  async function loadEvents() {
    setLoadingEvents(true)
    try {
      const result = await getAdminEvents({ club_id: clubId, limit: 100 })
      // Filter to events with one-off payment mode (or just show recent events)
      setEvents(result.events)
    } catch (err) {
      console.error('Failed to load events:', err)
    } finally {
      setLoadingEvents(false)
    }
  }

  async function fetchExportData(type: BillingExportType, eventId?: string): Promise<string> {
    const url = getBillingExportUrl(clubId, type, from, to, eventId)

    const { supabase } = await import('@/lib/supabase')
    const { data: { session } } = await supabase.auth.getSession()

    const headers: HeadersInit = {}
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Export failed: ${response.status}`)
    }

    return await response.text()
  }

  function parseCSV(csvText: string): { headers: string[]; rows: string[][] } {
    const lines = csvText.trim().split('\n')
    if (lines.length === 0) return { headers: [], rows: [] }

    const parseRow = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseRow(lines[0])
    const rows = lines.slice(1).map(line => parseRow(line))

    return { headers, rows }
  }

  async function handleExport(type: BillingExportType, format: 'csv' | 'pdf') {
    setExporting(`${type}-${format}`)
    try {
      const csvText = await fetchExportData(type)

      if (format === 'csv') {
        // Download as CSV
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = `${type}_${from}_to_${to}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      } else {
        // Generate PDF
        let { headers, rows } = parseCSV(csvText)

        const titleMap: Record<BillingExportType, string> = {
          attendance: 'Attendance Report',
          subscriptions: 'Subscriptions Report',
          event_fees: 'Event Fees Report',
          transactions: 'Transactions Report',
          members_billing: 'Members Billing Report',
        }

        // Transform data for specific export types
        if (type === 'transactions') {
          const transformed = transformTransactionsForPDF(headers, rows)
          headers = transformed.headers
          rows = transformed.rows
        }

        const doc = await generatePDF(
          { title: titleMap[type], headers, rows },
          clubName,
          { from, to }
        )

        doc.save(`${type}_${from}_to_${to}.pdf`)
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  async function handleEventFeesExport(format: 'csv' | 'pdf') {
    if (!selectedEventId) {
      alert('Please select an event to export')
      return
    }

    setExporting(`event_fees-${format}`)
    try {
      const csvText = await fetchExportData('event_fees', selectedEventId)
      const selectedEvent = events.find(e => e.id === selectedEventId)
      const eventName = selectedEvent?.title.replace(/\s+/g, '_') || selectedEventId

      if (format === 'csv') {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
        const downloadUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = `event_fees_${eventName}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      } else {
        let { headers, rows } = parseCSV(csvText)
        const eventDate = selectedEvent?.starts_at_utc?.split('T')[0] || ''

        // Transform to keep only relevant columns with total
        const transformed = transformEventFeesForPDF(headers, rows)
        headers = transformed.headers
        rows = transformed.rows

        const doc = await generatePDF(
          { title: 'Event Fees', headers, rows },
          clubName,
          { from: eventDate, to: eventDate },
          {
            orientation: 'portrait',
            subtitle: selectedEvent?.title || 'Event',
          }
        )

        doc.save(`event_fees_${eventName}.pdf`)
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const isExportingEventCSV = exporting === 'event_fees-csv'
  const isExportingEventPDF = exporting === 'event_fees-pdf'

  return (
    <div className={styles.exportsTab}>
      {/* Date Range Reports Section */}
      <div className={styles.exportSection}>
        <h3 className={styles.exportSectionTitle}>Date Range Reports</h3>
        <p className={styles.exportSectionDesc}>Export data for a specific date range</p>

        <div className={styles.dateRange}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={styles.formInput}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={styles.formInput}
            />
          </div>
        </div>

        <div className={styles.exportList}>
          <ExportItem
            title="Attendance"
            description="RSVP and attendance records for events"
            type="attendance"
            exporting={exporting}
            onExport={handleExport}
          />
          <ExportItem
            title="Subscriptions"
            description="Active subscriptions with Confirmed/Assumed status"
            type="subscriptions"
            exporting={exporting}
            onExport={handleExport}
          />
          <ExportItem
            title="Transactions"
            description="All payments including cash, Stripe, bank transfers"
            type="transactions"
            exporting={exporting}
            onExport={handleExport}
          />
          <ExportItem
            title="Members Billing"
            description="Member billing status and weekly usage"
            type="members_billing"
            exporting={exporting}
            onExport={handleExport}
          />
        </div>
      </div>

      {/* Event-Specific Reports Section */}
      <div className={styles.exportSection}>
        <h3 className={styles.exportSectionTitle}>Event Reports</h3>
        <p className={styles.exportSectionDesc}>Export payment details for a specific event</p>

        <div className={styles.eventSelector}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Select Event</label>
            {loadingEvents ? (
              <div className={styles.loadingSmall}><Spinner /></div>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className={styles.formSelect}
              >
                <option value="">Choose an event...</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.title} ({formatDate(event.starts_at_utc)})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className={styles.exportList}>
          <div className={styles.exportItem}>
            <div className={styles.exportInfo}>
              <div className={styles.exportTitle}>Event Fees</div>
              <div className={styles.exportDesc}>
                {selectedEventId
                  ? `Payment status for ${events.find(e => e.id === selectedEventId)?.title || 'selected event'}`
                  : 'Select an event above to export its payment details'}
              </div>
            </div>
            <div className={styles.exportButtons}>
              <button
                className={styles.btnSecondary}
                onClick={() => handleEventFeesExport('csv')}
                disabled={!selectedEventId || !!exporting}
              >
                {isExportingEventCSV ? 'Exporting...' : 'CSV'}
              </button>
              <button
                className={styles.btnPrimary}
                onClick={() => handleEventFeesExport('pdf')}
                disabled={!selectedEventId || !!exporting}
              >
                {isExportingEventPDF ? 'Exporting...' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExportItem({
  title,
  description,
  type,
  exporting,
  onExport,
}: {
  title: string
  description: string
  type: BillingExportType
  exporting: string | null
  onExport: (type: BillingExportType, format: 'csv' | 'pdf') => void
}) {
  const isExportingCSV = exporting === `${type}-csv`
  const isExportingPDF = exporting === `${type}-pdf`
  const isDisabled = !!exporting

  return (
    <div className={styles.exportItem}>
      <div className={styles.exportInfo}>
        <div className={styles.exportTitle}>{title}</div>
        <div className={styles.exportDesc}>{description}</div>
      </div>
      <div className={styles.exportButtons}>
        <button
          className={styles.btnSecondary}
          onClick={() => onExport(type, 'csv')}
          disabled={isDisabled}
        >
          {isExportingCSV ? 'Exporting...' : 'CSV'}
        </button>
        <button
          className={styles.btnPrimary}
          onClick={() => onExport(type, 'pdf')}
          disabled={isDisabled}
        >
          {isExportingPDF ? 'Exporting...' : 'PDF'}
        </button>
      </div>
    </div>
  )
}

// ============================================
// REFUNDS TAB (PLACEHOLDER)
// ============================================

function RefundsTab() {
  return (
    <div className={styles.refundsTab}>
      <div className={styles.placeholder}>
        <div className={styles.placeholderIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </div>
        <h3 className={styles.placeholderTitle}>Refunds Coming Soon</h3>
        <p className={styles.placeholderDesc}>
          Refund workflow and tracking will be available in a future update.
        </p>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export function AdminBilling() {
  const { memberships, loading: profileLoading } = useProfile()
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get('tab') as TabId) || 'overview'

  function setActiveTab(tab: TabId) {
    setSearchParams({ tab })
  }

  if (profileLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link to="/app/admin" className={styles.backLink}>
          &larr; Back to Admin
        </Link>
        <h1 className={styles.title}>Billing</h1>
        <p className={styles.subtitle}>
          {memberships[0]?.club_name || 'Billing control centre'}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'overview' && clubId && <OverviewTab clubId={clubId} />}
        {activeTab === 'members' && clubId && <MembersTab clubId={clubId} />}
        {activeTab === 'event-fees' && clubId && <EventFeesTab clubId={clubId} />}
        {activeTab === 'manual' && clubId && <ManualPaymentsTab clubId={clubId} />}
        {activeTab === 'exports' && clubId && <ExportsTab clubId={clubId} />}
        {activeTab === 'refunds' && <RefundsTab />}
      </div>
    </div>
  )
}
