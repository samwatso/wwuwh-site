import { useMemo, useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import { useProfile } from '@/hooks/useProfile'
import { useEvents } from '@/hooks/useEvents'
import { Spinner, Avatar, CalendarPopup, PaymentOptionsModal } from '@/components'
import { getEventAttendees, Attendee } from '@/lib/api'
import type { EventWithRsvp, RsvpResponse } from '@/types/database'
import styles from './Events.module.css'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isAllDayEvent(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const startsAtMidnight = start.getUTCHours() === 0 && start.getUTCMinutes() === 0
  const endsAtEndOfDay = (end.getUTCHours() === 23 && end.getUTCMinutes() === 59) ||
    (end.getUTCHours() === 0 && end.getUTCMinutes() === 0)
  return startsAtMidnight && endsAtEndOfDay
}

function getEventDays(startsAt: string, endsAt: string): number {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const startDate = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endDate = new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  const diffTime = endDate.getTime() - startDate.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) {
    return Math.max(1, diffDays)
  }
  return Math.max(1, diffDays + 1)
}

function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().split('T')[0]
}

function formatFee(cents: number | null, currency: string): string {
  if (!cents) return 'Free'
  const amount = cents / 100
  if (currency === 'GBP') return `£${amount.toFixed(2)}`
  return `${amount.toFixed(2)} ${currency}`
}

function groupEventsByDate(events: EventWithRsvp[]): Map<string, EventWithRsvp[]> {
  const groups = new Map<string, EventWithRsvp[]>()
  events.forEach((event) => {
    const key = getDateKey(event.starts_at_utc)
    const existing = groups.get(key) || []
    groups.set(key, [...existing, event])
  })
  return groups
}

function getGoogleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

// Format name as "FirstName S." (first name + surname initial)
function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const firstName = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || ''
  return `${firstName} ${lastInitial}.`
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

// Segmented RSVP Control - Attend / Decline
interface RSVPControlProps {
  selected: RsvpResponse | null
  onSelect: (response: RsvpResponse) => void
  loading: boolean
  disabled?: boolean
}

function RSVPControl({ selected, onSelect, loading, disabled }: RSVPControlProps) {
  const isAttending = selected === 'yes'
  const isDeclining = selected === 'no'

  return (
    <div className={`${styles.rsvpControl} ${loading ? styles.rsvpControlLoading : ''}`}>
      <button
        type="button"
        className={`${styles.rsvpSegment} ${styles.rsvpSegmentAttend} ${isAttending ? styles.rsvpSegmentActive : ''}`}
        onClick={(e) => { e.stopPropagation(); onSelect('yes'); }}
        disabled={loading || disabled}
        aria-pressed={isAttending}
      >
        {loading && isAttending ? <Spinner size="sm" /> : 'Attend'}
      </button>
      <button
        type="button"
        className={`${styles.rsvpSegment} ${styles.rsvpSegmentDecline} ${isDeclining ? styles.rsvpSegmentActive : ''}`}
        onClick={(e) => { e.stopPropagation(); onSelect('no'); }}
        disabled={loading || disabled}
        aria-pressed={isDeclining}
      >
        {loading && isDeclining ? <Spinner size="sm" /> : 'Decline'}
      </button>
    </div>
  )
}

// Avatar Hive - honeycomb-style overlapping avatars
interface AttendeeHiveProps {
  attendees: Attendee[]
  maxDisplay?: number
  size?: 'sm' | 'xs'
}

function AttendeeHive({ attendees, maxDisplay = 5, size = 'sm' }: AttendeeHiveProps) {
  const displayedAttendees = attendees.slice(0, maxDisplay)
  const remainingCount = attendees.length - maxDisplay

  if (attendees.length === 0) return null

  return (
    <div className={styles.attendeeHive}>
      <div className={styles.hiveAvatars}>
        {displayedAttendees.map((attendee, index) => (
          <div
            key={attendee.person_id}
            className={styles.hiveAvatar}
            style={{ zIndex: maxDisplay - index }}
          >
            <Avatar
              src={attendee.photo_url}
              name={attendee.name}
              size={size}
            />
          </div>
        ))}
        {remainingCount > 0 && (
          <div className={styles.hiveOverflow}>
            +{remainingCount}
          </div>
        )}
      </div>
    </div>
  )
}

// Expanded attendee list with formatted names
interface AttendeeListExpandedProps {
  attendees: { yes: Attendee[]; maybe: Attendee[]; no: Attendee[] }
  loading: boolean
}

function AttendeeListExpanded({ attendees, loading }: AttendeeListExpandedProps) {
  if (loading) {
    return (
      <div className={styles.attendeesLoading}>
        <Spinner size="sm" />
        <span>Loading attendees...</span>
      </div>
    )
  }

  const hasAttendees = attendees.yes.length > 0 || attendees.maybe.length > 0 || attendees.no.length > 0

  if (!hasAttendees) {
    return <p className={styles.noAttendees}>No responses yet</p>
  }

  return (
    <div className={styles.attendeesExpanded}>
      {attendees.yes.length > 0 && (
        <div className={styles.attendeeGroup}>
          <h4 className={styles.attendeeGroupTitle}>
            Attending ({attendees.yes.length})
          </h4>
          <div className={styles.attendeeList}>
            {attendees.yes.map((a) => (
              <div key={a.person_id} className={styles.attendeeItem}>
                <Avatar src={a.photo_url} name={a.name} size="xs" />
                <span className={styles.attendeeName}>{formatShortName(a.name)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {attendees.no.length > 0 && (
        <div className={styles.attendeeGroup}>
          <h4 className={styles.attendeeGroupTitle}>
            Declined ({attendees.no.length})
          </h4>
          <div className={styles.attendeeList}>
            {attendees.no.map((a) => (
              <div key={a.person_id} className={`${styles.attendeeItem} ${styles.attendeeDeclined}`}>
                <Avatar src={a.photo_url} name={a.name} size="xs" />
                <span className={styles.attendeeName}>{formatShortName(a.name)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EVENT CARD
// ============================================================================

interface EventCardProps {
  event: EventWithRsvp
  onRsvp: (eventId: string, response: RsvpResponse) => void
  rsvpLoading: boolean
  onPaymentComplete: () => void
  isPast?: boolean
}

function EventCard({ event, onRsvp, rsvpLoading, onPaymentComplete, isPast }: EventCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [attendees, setAttendees] = useState<{ yes: Attendee[]; maybe: Attendee[]; no: Attendee[] } | null>(null)
  const [attendeesLoading, setAttendeesLoading] = useState(false)
  const [showCalendarPopup, setShowCalendarPopup] = useState(false)
  const [showDescriptionPopup, setShowDescriptionPopup] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showRefundWarning, setShowRefundWarning] = useState(false)
  const [showBoaInfo, setShowBoaInfo] = useState(false)

  // Fetch attendees on mount for avatar preview
  const fetchAttendees = useCallback(async () => {
    if (attendees) return // Already loaded
    setAttendeesLoading(true)
    try {
      const response = await getEventAttendees(event.id)
      setAttendees(response.attendees)
    } catch (err) {
      console.error('Failed to load attendees:', err)
    } finally {
      setAttendeesLoading(false)
    }
  }, [event.id, attendees])

  // Load attendees on mount
  useEffect(() => {
    fetchAttendees()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check if user has paid via Stripe
  const hasStripePaid = event.payment_source === 'stripe' && event.payment_status === 'succeeded'

  const handleRsvp = (response: RsvpResponse) => {
    if (!rsvpLoading) {
      // If declining and user has paid via Stripe, show warning
      if (response === 'no' && hasStripePaid) {
        setShowRefundWarning(true)
        return
      }
      onRsvp(event.id, response)
    }
  }

  const handleConfirmDeclineWithRefundWarning = () => {
    setShowRefundWarning(false)
    onRsvp(event.id, 'no')
  }

  const handleOpenPaymentModal = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowPaymentModal(true)
  }

  const handlePaymentComplete = () => {
    onPaymentComplete()
  }

  const handleToggleExpand = () => {
    setExpanded(!expanded)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleToggleExpand()
    }
  }

  const hasPaid = event.has_paid === 1
  const subscriptionCovers = event.subscription_used === 1 ||
    (event.subscription_status === 'active' && !event.payment_required && !hasPaid)

  const allDay = isAllDayEvent(event.starts_at_utc, event.ends_at_utc)
  const eventDays = allDay ? getEventDays(event.starts_at_utc, event.ends_at_utc) : 0

  // Build time/duration string
  const timeDisplay = allDay
    ? (eventDays === 1 ? 'All day' : `${eventDays} days`)
    : formatTime(event.starts_at_utc)

  // Location short name
  const locationShort = event.location?.split(',')[0] || ''

  // Payment/status badge
  const getBadge = () => {
    if (hasPaid) return <span className={styles.paidBadge}>Paid</span>
    if (subscriptionCovers) return <span className={styles.includedBadge}>Included</span>
    if (event.kind !== 'session') {
      const kindClass = event.kind === 'match' ? styles.kindBadgeMatch
        : event.kind === 'tournament' ? styles.kindBadgeTournament
        : event.kind === 'social' ? styles.kindBadgeSocial
        : ''
      return <span className={`${styles.kindBadge} ${kindClass}`}>{event.kind}</span>
    }
    const fee = formatFee(event.fee_cents, event.currency)
    if (fee !== 'Free') return <span className={styles.eventFee}>{fee}</span>
    return null
  }

  // Simulated attendee list for hive (from count, or real data if loaded)
  const goingCount = event.rsvp_yes_count
  const hiveAttendees = attendees?.yes || []

  return (
    <article className={`${styles.eventCard} ${isPast ? styles.eventCardPast : ''}`}>
      {/* Tappable Header */}
      <div
        className={styles.cardHeader}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleToggleExpand}
        onKeyDown={handleKeyDown}
      >
        {/* Row 1: Title + Badge + Chevron */}
        <div className={styles.cardRow1}>
          <h3 className={styles.eventTitle}>{event.title}</h3>
          <div className={styles.cardRow1Right}>
            {event.external_source === 'boa' && (
              <button
                type="button"
                className={styles.boaBadge}
                onClick={(e) => { e.stopPropagation(); setShowBoaInfo(true); }}
                aria-label="Event sourced from British Octopush Association"
              >
                <span className={styles.boaBadgeIcon}>i</span>
              </button>
            )}
            {getBadge()}
            <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>

        {/* Row 2: Time • Location • Source */}
        <div className={styles.cardRow2}>
          <span className={styles.metaTime}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {timeDisplay}
          </span>
          {event.location && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <a
                href={getGoogleMapsUrl(event.location)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.metaLocation}
                onClick={(e) => e.stopPropagation()}
                title={event.location}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className={styles.locationText}>{locationShort}</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Social proof + RSVP */}
      <div className={styles.cardActions}>
        <div className={styles.socialProof}>
          {hiveAttendees.length > 0 ? (
            <AttendeeHive attendees={hiveAttendees} maxDisplay={5} size="xs" />
          ) : null}
          <span className={styles.goingCount}>
            {goingCount} going
          </span>
        </div>

        <div className={styles.actionsRight}>
          {/* Calendar button */}
          <button
            type="button"
            className={styles.calendarBtn}
            onClick={(e) => { e.stopPropagation(); setShowCalendarPopup(true); }}
            aria-label="Add to calendar"
            title="Add to calendar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {/* Payment button - only show when attending and not yet paid */}
          {!isPast && event.my_rsvp === 'yes' && event.fee_cents && event.fee_cents > 0 && event.payment_mode !== 'free' && !hasPaid && (
            (() => {
              const hasCashPending = event.payment_source === 'cash' && event.payment_status === 'pending'
              const hasBacsPending = event.payment_source === 'bank_transfer' && event.payment_status === 'pending'

              // Cash pending - show Cash button
              if (hasCashPending) {
                return (
                  <button
                    type="button"
                    className={styles.payBtnCash}
                    onClick={handleOpenPaymentModal}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Cash
                  </button>
                )
              }

              // BACS pending - show BACS button
              if (hasBacsPending) {
                return (
                  <button
                    type="button"
                    className={styles.payBtnBacs}
                    onClick={handleOpenPaymentModal}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M3 21h18" />
                      <path d="M5 21V7l7-4 7 4v14" />
                    </svg>
                    BACS
                  </button>
                )
              }

              // No payment yet - show Pay button if payment required
              if (event.payment_required) {
                return (
                  <button
                    type="button"
                    className={styles.payBtn}
                    onClick={handleOpenPaymentModal}
                  >
                    Pay
                  </button>
                )
              }

              return null
            })()
          )}
          {!isPast && (
            <RSVPControl
              selected={event.my_rsvp}
              onSelect={handleRsvp}
              loading={rsvpLoading}
            />
          )}
        </div>
      </div>

      {/* Calendar Popup */}
      {showCalendarPopup && (
        <CalendarPopup
          event={event}
          onClose={() => setShowCalendarPopup(false)}
        />
      )}

      {/* Payment Options Modal */}
      {showPaymentModal && (
        <PaymentOptionsModal
          event={event}
          onClose={() => setShowPaymentModal(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}

      {/* Refund Warning Modal (for Stripe-paid users declining) */}
      {showRefundWarning && (
        <div className={styles.modalOverlay} onClick={() => setShowRefundWarning(false)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Decline with Payment</h3>
            <p className={styles.confirmMessage}>
              You have already paid for this session via card.
            </p>
            <p className={styles.confirmMessage}>
              If you need a refund, please contact the club admin after declining.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowRefundWarning(false)}
              >
                Keep RSVP
              </button>
              <button
                className={styles.btnDanger}
                onClick={handleConfirmDeclineWithRefundWarning}
              >
                Decline Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {expanded && (
        <div className={styles.expandedDetails}>
          {/* Description */}
          {event.description && (
            <div className={styles.descriptionSection}>
              <p className={styles.descriptionText}>{event.description}</p>
              {event.description.length > 100 && (
                <button
                  type="button"
                  className={styles.readMoreBtn}
                  onClick={(e) => { e.stopPropagation(); setShowDescriptionPopup(true); }}
                >
                  Read more
                </button>
              )}
            </div>
          )}

          {/* Attendee list */}
          <div className={styles.attendeesSection}>
            {attendees ? (
              <AttendeeListExpanded attendees={attendees} loading={attendeesLoading} />
            ) : attendeesLoading ? (
              <div className={styles.attendeesLoading}>
                <Spinner size="sm" />
                <span>Loading attendees...</span>
              </div>
            ) : null}
          </div>

          {/* View Teams button - only in expanded view */}
          <div className={styles.expandedActions}>
            <Link
              to={`/app/events/${event.id}/teams`}
              className={styles.viewTeamsBtn}
              onClick={(e) => e.stopPropagation()}
            >
              View Teams
            </Link>
          </div>
        </div>
      )}

      {/* Description Popup */}
      {showDescriptionPopup && event.description && (
        <div className={styles.descriptionOverlay} onClick={() => setShowDescriptionPopup(false)}>
          <div className={styles.descriptionPopup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.descriptionPopupHeader}>
              <h4 className={styles.descriptionPopupTitle}>{event.title}</h4>
              <button
                type="button"
                className={styles.descriptionPopupClose}
                onClick={() => setShowDescriptionPopup(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <p className={styles.descriptionPopupText}>{event.description}</p>
          </div>
        </div>
      )}

      {/* BOA Info Popup */}
      {showBoaInfo && (
        <div className={styles.boaInfoOverlay} onClick={() => setShowBoaInfo(false)}>
          <div className={styles.boaInfoPopup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.boaInfoHeader}>
              <h4 className={styles.boaInfoTitle}>Event Source</h4>
              <button
                type="button"
                className={styles.boaInfoClose}
                onClick={() => setShowBoaInfo(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className={styles.boaInfoContent}>
              <p>
                This event has been published by the <strong>British Octopush Association</strong> (BOA).
              </p>
              <p>
                <strong>West Wickham Underwater Hockey Club</strong> is affiliated with the BOA, and national events are synced to your club calendar.
              </p>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

// ============================================================================
// EVENTS PAGE
// ============================================================================

export function Events() {
  const { memberships, loading: profileLoading } = useProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPastEvents, setShowPastEvents] = useState(false)

  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const {
    events,
    loading: eventsLoading,
    error,
    rsvp,
    rsvpLoading,
    rsvpConfirmation,
    clearRsvpConfirmation,
    refresh,
    subscription,
  } = useEvents({ clubId })

  // Handle late cancellation confirmation
  const handleConfirmLateCancel = async () => {
    if (!rsvpConfirmation) return
    try {
      await rsvp(rsvpConfirmation.eventId, rsvpConfirmation.response, true)
    } catch (err) {
      console.error('Failed to update RSVP:', err)
    }
  }

  const pastFrom = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString()
  }, [])
  const pastTo = useMemo(() => new Date().toISOString(), [])

  const {
    events: pastEvents,
    loading: pastEventsLoading,
    rsvp: pastRsvp,
    rsvpLoading: pastRsvpLoading,
  } = useEvents({
    clubId: showPastEvents ? clubId : '',
    from: pastFrom,
    to: pastTo,
  })

  useEffect(() => {
    const payment = searchParams.get('payment')
    if (payment === 'success') {
      setPaymentMessage({ type: 'success', text: 'Payment successful! You are confirmed for this session.' })
      setSearchParams({})
      refresh()
    } else if (payment === 'cancelled') {
      setPaymentMessage({ type: 'error', text: 'Payment was cancelled.' })
      setSearchParams({})
    }
  }, [searchParams, setSearchParams, refresh])

  // Refresh events when returning from in-app browser (iOS Stripe payment)
  useEffect(() => {
    const listener = Browser.addListener('browserFinished', () => {
      // User closed the in-app browser, refresh to check for payment updates
      refresh()
    })
    return () => {
      listener.then(l => l.remove())
    }
  }, [refresh])

  useEffect(() => {
    if (paymentMessage) {
      const timer = setTimeout(() => setPaymentMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [paymentMessage])

  const groupedEvents = useMemo(() => groupEventsByDate(events), [events])

  if (profileLoading || (eventsLoading && events.length === 0)) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading events...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <div className={styles.errorIcon}>!</div>
          <h2>Unable to load events</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!clubId) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h2>No Club Membership</h2>
          <p>You need to be a member of a club to see events.</p>
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Events</h1>
          <p className={styles.subtitle}>
            {memberships[0]?.club_name || 'Your club'}
          </p>
        </div>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h2>No Upcoming Events</h2>
          <p>There are no scheduled events at the moment.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Late Cancellation Confirmation Modal */}
      {rsvpConfirmation && (
        <div className={styles.modalOverlay} onClick={clearRsvpConfirmation}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Confirm Cancellation</h3>
            <p className={styles.confirmMessage}>
              You are assigned to <strong>{rsvpConfirmation.teamName}</strong> for this event.
              Declining now will remove you from the team and be recorded as a late cancellation.
            </p>
            <p className={styles.confirmMessage}>
              Are you sure you want to decline?
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnSecondary}
                onClick={clearRsvpConfirmation}
              >
                Keep RSVP
              </button>
              <button
                className={styles.btnDanger}
                onClick={handleConfirmLateCancel}
              >
                Yes, Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentMessage && (
        <div className={paymentMessage.type === 'success' ? styles.successMessage : styles.errorMessage}>
          {paymentMessage.text}
          <button
            className={styles.dismissBtn}
            onClick={() => setPaymentMessage(null)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Events</h1>
        <p className={styles.subtitle}>
          {memberships[0]?.club_name || 'Your club'}
        </p>
        {subscription && (
          <div className={styles.subscriptionBadge}>
            {subscription.plan_name} ({subscription.weekly_sessions_allowed}x/week)
          </div>
        )}
      </div>

      <div className={styles.eventsList}>
        {Array.from(groupedEvents.entries()).map(([dateKey, dateEvents]) => (
          <div key={dateKey} className={styles.dateGroup}>
            <div className={styles.dateHeader}>
              <span className={styles.dateLabel}>
                {formatDate(dateEvents[0].starts_at_utc)}
              </span>
              <div className={styles.dateLine} />
            </div>
            {dateEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onRsvp={rsvp}
                rsvpLoading={rsvpLoading === event.id}
                onPaymentComplete={refresh}
              />
            ))}
          </div>
        ))}
      </div>

      <div className={styles.pastEventsSection}>
        <button
          className={styles.togglePastBtn}
          onClick={() => setShowPastEvents(!showPastEvents)}
        >
          {showPastEvents ? '− Hide' : '+ Show'} past events
        </button>

        {showPastEvents && (
          <div className={styles.pastEventsList}>
            {pastEventsLoading ? (
              <div className={styles.loadingSmall}>
                <Spinner size="sm" />
                <span>Loading past events...</span>
              </div>
            ) : pastEvents.length === 0 ? (
              <p className={styles.noPastEvents}>No past events in the last 30 days</p>
            ) : (
              Array.from(groupEventsByDate(pastEvents).entries())
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([dateKey, dateEvents]) => (
                  <div key={dateKey} className={styles.dateGroup}>
                    <div className={styles.dateHeader}>
                      <span className={styles.dateLabel}>
                        {formatDate(dateEvents[0].starts_at_utc)}
                      </span>
                      <div className={styles.dateLine} />
                    </div>
                    {dateEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onRsvp={pastRsvp}
                        rsvpLoading={pastRsvpLoading === event.id}
                        onPaymentComplete={refresh}
                        isPast
                      />
                    ))}
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
