/**
 * AdminMembers Page
 *
 * Displays club members with subscription status and attendance stats.
 * Click on a member to view details and manage subscriptions.
 */

import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useAdminMembers } from '@/hooks/useAdminMembers'
import { Spinner } from '@/components'
import type { AdminMember, MemberDetailResponse, BillingPlan } from '@/lib/api'
import {
  getMemberDetail,
  createMemberSubscription,
  cancelMemberSubscription,
  recordMemberPayment,
  listBillingPlans,
} from '@/lib/api'
import styles from './AdminMembers.module.css'

// Helper to format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Helper to format currency
function formatCurrency(cents: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

// Helper to get attendance percentage
function getAttendancePercent(attended: number, total: number): number {
  if (total === 0) return 0
  return Math.round((attended / total) * 100)
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const badgeClass = status === 'active' ? styles.badgeActive :
                     status === 'suspended' ? styles.badgeSuspended :
                     styles.badgeInactive
  return <span className={`${styles.badge} ${badgeClass}`}>{status}</span>
}

// Subscription badge component
function SubscriptionBadge({ status, plan }: { status: string | null; plan: string | null }) {
  if (!status || status !== 'active') {
    return <span className={`${styles.badge} ${styles.badgeNone}`}>No subscription</span>
  }
  return <span className={`${styles.badge} ${styles.badgeSubscribed}`}>{plan || 'Active'}</span>
}

// Member row component
function MemberRow({ member, onClick }: { member: AdminMember; onClick: () => void }) {
  const attendancePercent = getAttendancePercent(member.sessions_attended, member.sessions_total)

  return (
    <div className={`${styles.memberRow} ${styles.memberRowClickable}`} onClick={onClick}>
      <div className={styles.memberInfo}>
        <div className={styles.memberName}>{member.name}</div>
        <div className={styles.memberEmail}>{member.email}</div>
      </div>
      <div className={styles.memberMeta}>
        <div className={styles.memberType}>
          {member.member_type === 'guest' && (
            <span className={`${styles.badge} ${styles.badgeGuest}`}>Guest</span>
          )}
          <StatusBadge status={member.status} />
        </div>
        <SubscriptionBadge status={member.subscription_status} plan={member.subscription_plan} />
      </div>
      <div className={styles.memberAttendance}>
        <div className={styles.attendanceBar}>
          <div
            className={styles.attendanceFill}
            style={{ width: `${attendancePercent}%` }}
          />
        </div>
        <div className={styles.attendanceText}>
          {member.sessions_attended}/{member.sessions_total} sessions ({attendancePercent}%)
        </div>
      </div>
      <div className={styles.memberJoined}>
        <span className={styles.label}>Joined</span>
        <span>{formatDate(member.joined_at)}</span>
      </div>
    </div>
  )
}

// Stats card component
function StatsCard({ label, value, subtext }: { label: string; value: number | string; subtext?: string }) {
  return (
    <div className={styles.statsCard}>
      <div className={styles.statsValue}>{value}</div>
      <div className={styles.statsLabel}>{label}</div>
      {subtext && <div className={styles.statsSubtext}>{subtext}</div>}
    </div>
  )
}

// Payment source badge
function PaymentSourceBadge({ source }: { source: string }) {
  const className = source === 'cash' ? styles.paymentSourceCash :
                    source === 'manual' ? styles.paymentSourceBacs :
                    source === 'stripe' ? styles.paymentSourceStripe :
                    styles.paymentSource
  const label = source === 'manual' ? 'BACS' : source.toUpperCase()
  return <span className={`${styles.paymentSource} ${className}`}>{label}</span>
}

// Member Detail Modal
interface MemberDetailModalProps {
  memberId: string
  clubId: string
  onClose: () => void
  onUpdate: () => void
}

function MemberDetailModal({ memberId, clubId, onClose, onUpdate }: MemberDetailModalProps) {
  const [detail, setDetail] = useState<MemberDetailResponse | null>(null)
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    loadMemberDetail()
  }, [memberId, clubId])

  async function loadMemberDetail() {
    setLoading(true)
    setError(null)
    try {
      const [memberData, plansData] = await Promise.all([
        getMemberDetail(memberId, clubId),
        listBillingPlans(clubId),
      ])
      setDetail(memberData)
      setPlans(plansData.plans)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load member details')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelSubscription() {
    if (!confirm('Are you sure you want to cancel this subscription?')) return

    setActionLoading(true)
    try {
      await cancelMemberSubscription(memberId, clubId)
      await loadMemberDetail()
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel subscription')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Member Details</h2>
          <button className={styles.modalClose} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.modalLoading}>
              <Spinner />
              <p>Loading member details...</p>
            </div>
          ) : error ? (
            <div className={styles.modalError}>{error}</div>
          ) : detail ? (
            <div className={styles.memberDetail}>
              {/* Member Info */}
              <div className={styles.memberDetailHeader}>
                <div className={styles.memberDetailName}>{detail.name}</div>
                <div className={styles.memberDetailEmail}>{detail.email}</div>
                <div className={styles.memberDetailBadges}>
                  {detail.member_type === 'guest' && (
                    <span className={`${styles.badge} ${styles.badgeGuest}`}>Guest</span>
                  )}
                  <StatusBadge status={detail.status} />
                </div>
              </div>

              {/* Subscription Section */}
              <div className={styles.subscriptionSection}>
                <div className={styles.subscriptionSectionTitle}>Subscription</div>
                {detail.subscription ? (
                  <div className={styles.subscriptionInfo}>
                    <div className={styles.subscriptionRow}>
                      <span className={styles.subscriptionLabel}>Plan</span>
                      <span className={styles.subscriptionValue}>{detail.subscription.plan_name}</span>
                    </div>
                    <div className={styles.subscriptionRow}>
                      <span className={styles.subscriptionLabel}>Status</span>
                      <span className={styles.subscriptionValue}>{detail.subscription.status}</span>
                    </div>
                    <div className={styles.subscriptionRow}>
                      <span className={styles.subscriptionLabel}>Sessions/week</span>
                      <span className={styles.subscriptionValue}>{detail.subscription.weekly_sessions_allowed}</span>
                    </div>
                    <div className={styles.subscriptionRow}>
                      <span className={styles.subscriptionLabel}>Price</span>
                      <span className={styles.subscriptionValue}>
                        {formatCurrency(detail.subscription.price_cents)}/month
                      </span>
                    </div>
                    <div className={styles.subscriptionRow}>
                      <span className={styles.subscriptionLabel}>Type</span>
                      <span className={styles.subscriptionValue}>
                        {detail.subscription.is_manual ? 'Manual' : 'Stripe'}
                      </span>
                    </div>
                    <div className={styles.subscriptionRow}>
                      <span className={styles.subscriptionLabel}>Started</span>
                      <span className={styles.subscriptionValue}>{formatDate(detail.subscription.start_at)}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles.noSubscription}>No active subscription</div>
                )}
              </div>

              {/* Actions */}
              <div className={styles.actions}>
                {!detail.subscription ? (
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                    onClick={() => setShowAssignModal(true)}
                    disabled={actionLoading}
                  >
                    Assign Subscription
                  </button>
                ) : (
                  <>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
                      onClick={() => setShowPaymentModal(true)}
                      disabled={actionLoading}
                    >
                      Record Payment
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={handleCancelSubscription}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                  </>
                )}
              </div>

              {/* Recent Payments */}
              <div className={styles.paymentsSection}>
                <div className={styles.subscriptionSectionTitle}>Recent Payments</div>
                {detail.recent_payments.length > 0 ? (
                  <div className={styles.paymentsList}>
                    {detail.recent_payments.map(payment => (
                      <div key={payment.id} className={styles.paymentItem}>
                        <PaymentSourceBadge source={payment.source} />
                        <span className={styles.paymentAmount}>
                          {formatCurrency(payment.amount_cents, payment.currency)}
                        </span>
                        <span className={styles.paymentDate}>{formatDate(payment.created_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.noPayments}>No payment history</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Assign Subscription Modal */}
      {showAssignModal && detail && (
        <AssignSubscriptionModal
          memberId={memberId}
          clubId={clubId}
          memberName={detail.name}
          plans={plans}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => {
            setShowAssignModal(false)
            loadMemberDetail()
            onUpdate()
          }}
        />
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && detail && (
        <RecordPaymentModal
          memberId={memberId}
          clubId={clubId}
          memberName={detail.name}
          defaultAmount={detail.subscription?.price_cents}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false)
            loadMemberDetail()
          }}
        />
      )}
    </div>
  )
}

// Assign Subscription Modal
interface AssignSubscriptionModalProps {
  memberId: string
  clubId: string
  memberName: string
  plans: BillingPlan[]
  onClose: () => void
  onSuccess: () => void
}

function AssignSubscriptionModal({
  memberId,
  clubId,
  memberName,
  plans,
  onClose,
  onSuccess,
}: AssignSubscriptionModalProps) {
  const [planId, setPlanId] = useState(plans[0]?.id || '')
  const [paymentSource, setPaymentSource] = useState<'cash' | 'bacs' | 'free'>('cash')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPlan = plans.find(p => p.id === planId)

  useEffect(() => {
    if (selectedPlan && paymentSource !== 'free') {
      setAmount((selectedPlan.price_cents / 100).toFixed(2))
    } else {
      setAmount('')
    }
  }, [planId, paymentSource, selectedPlan])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!planId) {
      setError('Please select a plan')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await createMemberSubscription(memberId, clubId, {
        plan_id: planId,
        payment_source: paymentSource,
        amount_cents: paymentSource !== 'free' ? Math.round(parseFloat(amount) * 100) : undefined,
        payment_reference: reference || undefined,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subscription')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Assign Subscription</h2>
          <button className={styles.modalClose} onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <p style={{ marginBottom: 'var(--space-md)', color: 'var(--grey-600)' }}>
              Assign a subscription to <strong>{memberName}</strong>
            </p>

            {error && <div className={styles.modalError}>{error}</div>}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Plan</label>
              <select
                className={styles.formSelect}
                value={planId}
                onChange={e => setPlanId(e.target.value)}
                required
              >
                {plans.length === 0 ? (
                  <option value="">No plans available</option>
                ) : (
                  plans.map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {formatCurrency(plan.price_cents)}/month ({plan.weekly_sessions_allowed} session{plan.weekly_sessions_allowed > 1 ? 's' : ''}/week)
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Payment Method</label>
              <select
                className={styles.formSelect}
                value={paymentSource}
                onChange={e => setPaymentSource(e.target.value as 'cash' | 'bacs' | 'free')}
              >
                <option value="cash">Cash</option>
                <option value="bacs">BACS Transfer</option>
                <option value="free">Free / Comped</option>
              </select>
            </div>

            {paymentSource !== 'free' && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Amount (GBP)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={styles.formInput}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                  />
                </div>

                {paymentSource === 'bacs' && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Reference (optional)</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={reference}
                      onChange={e => setReference(e.target.value)}
                      placeholder="e.g. Bank transfer ref"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              disabled={loading || plans.length === 0}
            >
              {loading ? 'Creating...' : 'Assign Subscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Record Payment Modal
interface RecordPaymentModalProps {
  memberId: string
  clubId: string
  memberName: string
  defaultAmount?: number
  onClose: () => void
  onSuccess: () => void
}

function RecordPaymentModal({
  memberId,
  clubId,
  memberName,
  defaultAmount,
  onClose,
  onSuccess,
}: RecordPaymentModalProps) {
  const [paymentSource, setPaymentSource] = useState<'cash' | 'bacs'>('cash')
  const [amount, setAmount] = useState(defaultAmount ? (defaultAmount / 100).toFixed(2) : '')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountCents = Math.round(parseFloat(amount) * 100)
    if (!amountCents || amountCents <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await recordMemberPayment(memberId, clubId, {
        payment_source: paymentSource,
        amount_cents: amountCents,
        payment_reference: reference || undefined,
        description: description || undefined,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Record Payment</h2>
          <button className={styles.modalClose} onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <p style={{ marginBottom: 'var(--space-md)', color: 'var(--grey-600)' }}>
              Record a payment for <strong>{memberName}</strong>
            </p>

            {error && <div className={styles.modalError}>{error}</div>}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Payment Method</label>
              <select
                className={styles.formSelect}
                value={paymentSource}
                onChange={e => setPaymentSource(e.target.value as 'cash' | 'bacs')}
              >
                <option value="cash">Cash</option>
                <option value="bacs">BACS Transfer</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Amount (GBP)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={styles.formInput}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>

            {paymentSource === 'bacs' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Reference (optional)</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="e.g. Bank transfer ref"
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description (optional)</label>
              <input
                type="text"
                className={styles.formInput}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Monthly subscription"
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              disabled={loading}
            >
              {loading ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AdminMembers() {
  const { memberships, loading: profileLoading } = useProfile()
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const {
    members,
    stats,
    loading,
    error,
    setSearch,
    setStatus,
    refresh,
  } = useAdminMembers({ clubId })

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    // Simple debounce
    setTimeout(() => {
      setSearch(value)
    }, 300)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setStatus(value)
  }

  // Filter members client-side for immediate feedback
  const filteredMembers = useMemo(() => {
    let result = members

    if (searchInput) {
      const searchLower = searchInput.toLowerCase()
      result = result.filter(
        m => m.name.toLowerCase().includes(searchLower) ||
             m.email.toLowerCase().includes(searchLower)
      )
    }

    if (statusFilter) {
      result = result.filter(m => m.status === statusFilter)
    }

    return result
  }, [members, searchInput, statusFilter])

  // Loading state
  if (profileLoading || (loading && members.length === 0)) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading members...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link to="/app/admin" className={styles.backLink}>
            &larr; Back to Admin
          </Link>
          <h1 className={styles.title}>Members</h1>
        </div>
        <div className={styles.error}>
          <div className={styles.errorIcon}>!</div>
          <h2>Unable to load members</h2>
          <p>{error}</p>
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
        <h1 className={styles.title}>Members</h1>
        <p className={styles.subtitle}>
          {memberships[0]?.club_name || 'Manage club members'}
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className={styles.statsGrid}>
          <StatsCard label="Total Members" value={stats.total_members} />
          <StatsCard label="Active" value={stats.active_members} />
          <StatsCard label="With Subscription" value={stats.active_subscriptions} />
          <StatsCard label="Guests" value={stats.guests} />
        </div>
      )}

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          className={styles.statusSelect}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="left">Left</option>
        </select>
      </div>

      {/* Members List */}
      <div className={styles.membersList}>
        {filteredMembers.length === 0 ? (
          <div className={styles.empty}>
            <p>No members found</p>
          </div>
        ) : (
          filteredMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              onClick={() => setSelectedMemberId(member.id)}
            />
          ))
        )}
      </div>

      {/* Period info */}
      {stats && stats.period_sessions > 0 && (
        <div className={styles.periodInfo}>
          Attendance based on {stats.period_sessions} sessions in the last 12 weeks
        </div>
      )}

      {/* Member Detail Modal */}
      {selectedMemberId && clubId && (
        <MemberDetailModal
          memberId={selectedMemberId}
          clubId={clubId}
          onClose={() => setSelectedMemberId(null)}
          onUpdate={refresh}
        />
      )}
    </div>
  )
}
