import { useMemo, useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useEvents } from '@/hooks/useEvents'
import { Spinner, Avatar } from '@/components'
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
  onPay: (eventId: string) => void
  payLoading: boolean
  isPast?: boolean
}

function EventCard({ event, onRsvp, rsvpLoading, onPay, payLoading, isPast }: EventCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [attendees, setAttendees] = useState<{ yes: Attendee[]; maybe: Attendee[]; no: Attendee[] } | null>(null)
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  const handleRsvp = (response: RsvpResponse) => {
    if (!rsvpLoading) {
      onRsvp(event.id, response)
    }
  }

  const handlePay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!payLoading) {
      onPay(event.id)
    }
  }

  const handleToggleExpand = async () => {
    if (!expanded && !attendees) {
      setAttendeesLoading(true)
      try {
        const response = await getEventAttendees(event.id)
        setAttendees(response.attendees)
      } catch (err) {
        console.error('Failed to load attendees:', err)
      } finally {
        setAttendeesLoading(false)
      }
    }
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
            {getBadge()}
            <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>

        {/* Row 2: Time • Location */}
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
          {event.payment_required && !isPast && (
            <button
              type="button"
              className={styles.payBtn}
              onClick={handlePay}
              disabled={payLoading}
            >
              {payLoading ? <Spinner size="sm" /> : 'Pay'}
            </button>
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

      {/* Expanded Details */}
      {expanded && (
        <div className={styles.expandedDetails}>
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
    pay,
    payLoading,
    refresh,
    subscription,
  } = useEvents({ clubId })

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
    pay: pastPay,
    payLoading: pastPayLoading,
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
                onPay={pay}
                payLoading={payLoading === event.id}
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
                        onPay={pastPay}
                        payLoading={pastPayLoading === event.id}
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
