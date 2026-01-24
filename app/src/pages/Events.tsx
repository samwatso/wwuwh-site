import { useMemo, useEffect, useState, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useEvents } from '@/hooks/useEvents'
import { Spinner, Avatar } from '@/components'
import { getEventAttendees, Attendee } from '@/lib/api'
import type { EventWithRsvp, RsvpResponse } from '@/types/database'
import styles from './Events.module.css'

// Helper to format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// Helper to format time for display
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Helper to check if event is all-day (starts at midnight)
function isAllDayEvent(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  // Check if starts at midnight (00:00)
  const startsAtMidnight = start.getUTCHours() === 0 && start.getUTCMinutes() === 0
  // Check if ends at end of day (23:59) or midnight next day
  const endsAtEndOfDay = (end.getUTCHours() === 23 && end.getUTCMinutes() === 59) ||
    (end.getUTCHours() === 0 && end.getUTCMinutes() === 0)
  return startsAtMidnight && endsAtEndOfDay
}

// Helper to calculate event duration in days
function getEventDays(startsAt: string, endsAt: string): number {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  // Get just the date parts
  const startDate = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endDate = new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  // Calculate difference in days
  const diffTime = endDate.getTime() - startDate.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  // If ends at midnight, it's the same logical day
  if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) {
    return Math.max(1, diffDays)
  }
  return Math.max(1, diffDays + 1)
}

// Helper to get date key for grouping
function getDateKey(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toISOString().split('T')[0]
}

// Helper to format fee
function formatFee(cents: number | null, currency: string): string {
  if (!cents) return 'Free'
  const amount = cents / 100
  if (currency === 'GBP') return `£${amount.toFixed(2)}`
  return `${amount.toFixed(2)} ${currency}`
}

// Group events by date
function groupEventsByDate(events: EventWithRsvp[]): Map<string, EventWithRsvp[]> {
  const groups = new Map<string, EventWithRsvp[]>()

  events.forEach((event) => {
    const key = getDateKey(event.starts_at_utc)
    const existing = groups.get(key) || []
    groups.set(key, [...existing, event])
  })

  return groups
}

// Helper to create Google Maps URL
function getGoogleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

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
  const [rsvpDropdownOpen, setRsvpDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRsvpDropdownOpen(false)
      }
    }
    if (rsvpDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [rsvpDropdownOpen])

  const handleRsvp = (response: RsvpResponse) => {
    if (!rsvpLoading) {
      onRsvp(event.id, response)
      setRsvpDropdownOpen(false)
    }
  }

  const handlePay = () => {
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

  const getKindBadgeClass = () => {
    switch (event.kind) {
      case 'match':
        return styles.kindBadgeMatch
      case 'tournament':
        return styles.kindBadgeTournament
      case 'social':
        return styles.kindBadgeSocial
      default:
        return ''
    }
  }

  const hasPaid = event.has_paid === 1
  const subscriptionCovers = event.subscription_used === 1 ||
    (event.subscription_status === 'active' && !event.payment_required && !hasPaid)

  // Check if this is an all-day event
  const allDay = isAllDayEvent(event.starts_at_utc, event.ends_at_utc)
  const eventDays = allDay ? getEventDays(event.starts_at_utc, event.ends_at_utc) : 0

  return (
    <div className={`${styles.eventCard} ${isPast ? styles.eventCardPast : ''}`}>
      <div className={styles.eventHeader} onClick={handleToggleExpand} style={{ cursor: 'pointer' }}>
        <div className={styles.eventIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div className={styles.eventInfo}>
          <div className={styles.eventTitle}>{event.title}</div>
          <div className={styles.eventMeta}>
            <span className={styles.eventTime}>
              {allDay ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  {eventDays === 1 ? 'All day' : `${eventDays} days`}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatTime(event.starts_at_utc)}
                </>
              )}
            </span>
            {event.location && (
              <a
                href={getGoogleMapsUrl(event.location)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.eventLocation}
                onClick={(e) => e.stopPropagation()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className={styles.locationText}>{event.location.split(',')[0]}</span>
              </a>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          {event.kind !== 'session' && (
            <span className={`${styles.kindBadge} ${getKindBadgeClass()}`}>
              {event.kind}
            </span>
          )}
          {hasPaid ? (
            <span className={styles.paidBadge}>Paid</span>
          ) : subscriptionCovers ? (
            <span className={styles.includedBadge}>Included</span>
          ) : (
            <span className={styles.eventFee}>
              {formatFee(event.fee_cents, event.currency)}
            </span>
          )}
          <span className={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className={styles.eventDetails}>
          {/* Location - clickable to open in Maps */}
          {event.location && (
            <a
              href={getGoogleMapsUrl(event.location)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.locationSection}
              onClick={(e) => e.stopPropagation()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className={styles.locationFull}>{event.location}</span>
            </a>
          )}

          {/* Attendees list */}
          <div className={styles.attendeesSection}>
            {attendeesLoading ? (
              <div className={styles.attendeesLoading}>
                <Spinner size="sm" />
                <span>Loading attendees...</span>
              </div>
            ) : attendees ? (
              <>
                {attendees.yes.length > 0 && (
                  <div className={styles.attendeeGroup}>
                    <h4 className={styles.attendeeGroupTitle}>
                      Going ({attendees.yes.length})
                    </h4>
                    <div className={styles.attendeeList}>
                      {attendees.yes.map((a) => (
                        <div key={a.person_id} className={styles.attendeeItem}>
                          <Avatar src={a.photo_url} name={a.name} size="xs" />
                          <span className={styles.attendeeName}>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {attendees.maybe.length > 0 && (
                  <div className={styles.attendeeGroup}>
                    <h4 className={styles.attendeeGroupTitle}>
                      Maybe ({attendees.maybe.length})
                    </h4>
                    <div className={styles.attendeeList}>
                      {attendees.maybe.map((a) => (
                        <div key={a.person_id} className={styles.attendeeItem}>
                          <Avatar src={a.photo_url} name={a.name} size="xs" />
                          <span className={styles.attendeeName}>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {attendees.no.length > 0 && (
                  <div className={styles.attendeeGroup}>
                    <h4 className={styles.attendeeGroupTitle}>
                      Not Going ({attendees.no.length})
                    </h4>
                    <div className={styles.attendeeList}>
                      {attendees.no.map((a) => (
                        <div key={a.person_id} className={`${styles.attendeeItem} ${styles.attendeeNo}`}>
                          <Avatar src={a.photo_url} name={a.name} size="xs" />
                          <span className={styles.attendeeName}>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {attendees.yes.length === 0 && attendees.maybe.length === 0 && attendees.no.length === 0 && (
                  <p className={styles.noAttendees}>No responses yet</p>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      <div className={styles.rsvpSection}>
        <div className={styles.rsvpCounts}>
          <span className={`${styles.rsvpCount} ${styles.rsvpCountYes}`}>
            {event.rsvp_yes_count} going
          </span>
          {event.rsvp_maybe_count > 0 && (
            <span className={`${styles.rsvpCount} ${styles.rsvpCountMaybe}`}>
              {event.rsvp_maybe_count} maybe
            </span>
          )}
          <Link to={`/app/events/${event.id}/teams`} className={styles.teamsLink} onClick={(e) => e.stopPropagation()}>
            View Teams
          </Link>
        </div>
        {!isPast && (
          <>
            {/* Desktop RSVP buttons */}
            <div className={styles.rsvpButtons}>
              {event.payment_required && (
                <button
                  className={styles.payBtn}
                  onClick={(e) => { e.stopPropagation(); handlePay(); }}
                  disabled={payLoading}
                >
                  {payLoading ? <Spinner size="sm" /> : 'Pay'}
                </button>
              )}
              <button
                className={`${styles.rsvpBtn} ${styles.rsvpBtnYes} ${event.my_rsvp === 'yes' ? styles.rsvpBtnActive : ''}`}
                onClick={(e) => { e.stopPropagation(); handleRsvp('yes'); }}
                disabled={rsvpLoading}
                aria-pressed={event.my_rsvp === 'yes'}
              >
                {rsvpLoading ? <Spinner size="sm" /> : 'Yes'}
              </button>
              <button
                className={`${styles.rsvpBtn} ${styles.rsvpBtnMaybe} ${event.my_rsvp === 'maybe' ? styles.rsvpBtnActive : ''}`}
                onClick={(e) => { e.stopPropagation(); handleRsvp('maybe'); }}
                disabled={rsvpLoading}
                aria-pressed={event.my_rsvp === 'maybe'}
              >
                Maybe
              </button>
              <button
                className={`${styles.rsvpBtn} ${styles.rsvpBtnNo} ${event.my_rsvp === 'no' ? styles.rsvpBtnActive : ''}`}
                onClick={(e) => { e.stopPropagation(); handleRsvp('no'); }}
                disabled={rsvpLoading}
                aria-pressed={event.my_rsvp === 'no'}
              >
                No
              </button>
            </div>

            {/* Mobile RSVP dropdown */}
            <div className={styles.rsvpDropdown} ref={dropdownRef}>
              {event.payment_required && (
                <button
                  className={styles.payBtn}
                  onClick={(e) => { e.stopPropagation(); handlePay(); }}
                  disabled={payLoading}
                >
                  {payLoading ? <Spinner size="sm" /> : 'Pay'}
                </button>
              )}
              <button
                className={`${styles.rsvpDropdownBtn} ${
                  event.my_rsvp === 'yes' ? styles.rsvpDropdownBtnYes :
                  event.my_rsvp === 'maybe' ? styles.rsvpDropdownBtnMaybe :
                  event.my_rsvp === 'no' ? styles.rsvpDropdownBtnNo : ''
                }`}
                onClick={(e) => { e.stopPropagation(); setRsvpDropdownOpen(!rsvpDropdownOpen); }}
              >
                {rsvpLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    {event.my_rsvp === 'yes' ? 'Going' :
                     event.my_rsvp === 'maybe' ? 'Maybe' :
                     event.my_rsvp === 'no' ? 'Not Going' : 'RSVP'}
                    <svg
                      className={`${styles.rsvpDropdownChevron} ${rsvpDropdownOpen ? styles.rsvpDropdownChevronOpen : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </>
                )}
              </button>
              {rsvpDropdownOpen && (
                <div className={styles.rsvpDropdownMenu}>
                  <button
                    className={`${styles.rsvpDropdownItem} ${styles.rsvpDropdownItemYes} ${event.my_rsvp === 'yes' ? styles.rsvpDropdownItemActive : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleRsvp('yes'); }}
                  >
                    Yes
                  </button>
                  <button
                    className={`${styles.rsvpDropdownItem} ${styles.rsvpDropdownItemMaybe} ${event.my_rsvp === 'maybe' ? styles.rsvpDropdownItemActive : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleRsvp('maybe'); }}
                  >
                    Maybe
                  </button>
                  <button
                    className={`${styles.rsvpDropdownItem} ${styles.rsvpDropdownItemNo} ${event.my_rsvp === 'no' ? styles.rsvpDropdownItemActive : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleRsvp('no'); }}
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function Events() {
  const { memberships, loading: profileLoading } = useProfile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showPastEvents, setShowPastEvents] = useState(false)

  // Get the first active club membership
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  // Future events
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

  // Past events (30 days back)
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

  // Handle payment return
  useEffect(() => {
    const payment = searchParams.get('payment')
    if (payment === 'success') {
      setPaymentMessage({ type: 'success', text: 'Payment successful! You are confirmed for this session.' })
      // Clear the query params
      setSearchParams({})
      // Refresh events to update payment status
      refresh()
    } else if (payment === 'cancelled') {
      setPaymentMessage({ type: 'error', text: 'Payment was cancelled.' })
      setSearchParams({})
    }
  }, [searchParams, setSearchParams, refresh])

  // Auto-dismiss payment message after 5 seconds
  useEffect(() => {
    if (paymentMessage) {
      const timer = setTimeout(() => setPaymentMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [paymentMessage])

  const groupedEvents = useMemo(() => groupEventsByDate(events), [events])

  // Loading state
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

  // Error state
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

  // No club membership
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

  // Empty state
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
      {/* Payment Message */}
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

      {/* Past Events Toggle */}
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
                .sort(([a], [b]) => b.localeCompare(a)) // Sort descending (most recent first)
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
