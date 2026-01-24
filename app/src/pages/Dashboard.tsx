import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useEvents } from '@/hooks/useEvents'
import { useCountdown } from '@/hooks/useCountdown'
import { Spinner, Avatar } from '@/components'
import type { EventWithRsvp, RsvpResponse, EventKind } from '@/types/database'
import styles from './Dashboard.module.css'

// Helper to format date compactly (e.g., "Sat 21 Mar · 15:30")
function formatCompactDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' })
  const day = date.getDate()
  const month = date.toLocaleDateString('en-GB', { month: 'short' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${dayName} ${day} ${month} · ${time}`
}

// Helper to get event type label
function getEventTypeLabel(kind: EventKind): string {
  const labels: Record<EventKind, string> = {
    session: 'Session',
    training: 'Training',
    ladies: 'Ladies',
    tournament: 'Tournament',
    social: 'Social',
    match: 'Match',
    other: 'Other',
  }
  return labels[kind] || 'Event'
}

// Helper to get event type color class
function getEventTypeClass(kind: EventKind): string {
  switch (kind) {
    case 'session':
    case 'training':
      return styles.typePillSession
    case 'ladies':
      return styles.typePillLadies
    case 'tournament':
    case 'match':
      return styles.typePillTournament
    case 'social':
      return styles.typePillSocial
    default:
      return styles.typePillOther
  }
}

// Helper to generate Google Maps URL
function getGoogleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

// Helper to generate ICS file content
function generateIcsContent(event: EventWithRsvp): string {
  const formatIcsDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }

  const startDate = formatIcsDate(event.starts_at_utc)
  const endDate = formatIcsDate(event.ends_at_utc)
  const now = formatIcsDate(new Date().toISOString())

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WWUWH//Event//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@wwuwh.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `SUMMARY:${event.title}`,
    event.location ? `LOCATION:${event.location}` : '',
    event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}

// Helper to download ICS file
function downloadIcs(event: EventWithRsvp) {
  const content = generateIcsContent(event)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface EventItemProps {
  event: EventWithRsvp
  onRsvp: (eventId: string, response: RsvpResponse) => void
  rsvpLoading: boolean
}

function EventItem({ event, onRsvp, rsvpLoading }: EventItemProps) {
  return (
    <div className={styles.eventItem}>
      <div className={styles.eventInfo}>
        <div className={styles.eventHeader}>
          <span className={styles.eventTitle}>{event.title}</span>
          <span className={`${styles.typePill} ${getEventTypeClass(event.kind)}`}>
            {getEventTypeLabel(event.kind)}
          </span>
        </div>
        <div className={styles.eventMeta}>
          <span className={styles.eventDateTime}>
            <svg className={styles.calendarIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formatCompactDateTime(event.starts_at_utc)}
          </span>
          {event.rsvp_yes_count > 0 && (
            <span className={styles.goingCount}>{event.rsvp_yes_count} going</span>
          )}
        </div>
        {event.location && (
          <span className={styles.eventLocation}>{event.location.split(',')[0]}</span>
        )}
      </div>
      <div className={styles.eventActions}>
        <button
          className={`${styles.rsvpBtn} ${styles.rsvpYes}`}
          onClick={() => onRsvp(event.id, 'yes')}
          disabled={rsvpLoading}
          title="Going"
        >
          {rsvpLoading ? <Spinner size="sm" /> : '✓'}
        </button>
        <button
          className={`${styles.rsvpBtn} ${styles.rsvpNo}`}
          onClick={() => onRsvp(event.id, 'no')}
          disabled={rsvpLoading}
          title="Not going"
        >
          ✗
        </button>
      </div>
    </div>
  )
}

interface UpNextCardProps {
  event: EventWithRsvp
}

function UpNextCard({ event }: UpNextCardProps) {
  const countdown = useCountdown(event.starts_at_utc)

  return (
    <div className={styles.upNextCard}>
      <div className={styles.upNextHeader}>
        <h2 className={styles.cardTitle}>Up Next</h2>
        <span className={styles.upNextCountdown}>
          {countdown?.text || 'Soon'}
        </span>
      </div>
      <div className={styles.upNextContent}>
        <div className={styles.upNextMain}>
          <span className={styles.upNextTitle}>{event.title}</span>
          {event.location && (
            <span className={styles.upNextVenue}>{event.location.split(',')[0]}</span>
          )}
          <span className={styles.upNextDateTime}>
            {formatCompactDateTime(event.starts_at_utc)}
          </span>
        </div>
        <div className={styles.upNextActions}>
          {event.location && (
            <a
              href={getGoogleMapsUrl(event.location)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.upNextAction}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Maps
            </a>
          )}
          <button
            className={styles.upNextAction}
            onClick={() => downloadIcs(event)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendar
          </button>
        </div>
      </div>
    </div>
  )
}

interface ProfileCompletionProps {
  hasName: boolean
  hasPhoto: boolean
}

function ProfileCompletionCard({ hasName, hasPhoto }: ProfileCompletionProps) {
  // 33% for account, 33% for name, 33% for photo
  const completion = 33 + (hasName ? 33 : 0) + (hasPhoto ? 34 : 0)
  const isComplete = completion === 100

  return (
    <Link to="/app/profile" className={`${styles.statCard} ${styles.profileCard}`}>
      <div className={styles.statIcon}>
        {isComplete ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
      </div>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>
          {isComplete ? 'Profile Complete' : 'Profile'}
        </span>
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${isComplete ? styles.progressComplete : ''}`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className={styles.progressText}>
            {isComplete ? '✓' : `${completion}%`}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const { person, memberships, loading: profileLoading, error: profileError } = useProfile()

  // Get club ID from first membership
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const {
    events,
    loading: eventsLoading,
    rsvp,
    rsvpLoading,
  } = useEvents({ clubId })

  // Find the next event user is attending (RSVP = yes)
  const upNextEvent = useMemo(() => {
    const now = new Date()
    return events
      .filter(e => e.my_rsvp === 'yes' && new Date(e.starts_at_utc) > now)
      .sort((a, b) => new Date(a.starts_at_utc).getTime() - new Date(b.starts_at_utc).getTime())[0] || null
  }, [events])

  // Filter events that need a response (no RSVP yet)
  const eventsNeedingResponse = useMemo(() => {
    return events.filter(e => e.my_rsvp === null).slice(0, 5)
  }, [events])

  // Count upcoming events
  const upcomingCount = events.length

  // Profile completion checks
  const hasName = !!(person?.name && person.name.trim().length > 0)
  const hasPhoto = !!(person?.photo_url && person.photo_url.trim().length > 0)

  return (
    <div className={styles.container}>
      {/* Welcome Section */}
      <div className={styles.welcome}>
        <Avatar
          src={person?.photo_url}
          name={person?.name || user?.email || 'User'}
          size="lg"
          className={styles.welcomeAvatar}
        />
        <h1 className={styles.title}>
          {person?.name ? `Welcome, ${person.name.split(' ')[0]}` : 'Welcome'}
        </h1>
        <p className={styles.subtitle}>
          {memberships[0]?.club_name || user?.email}
        </p>

        {/* Profile Sync Status */}
        {profileLoading && (
          <div className={styles.syncStatus}>
            <span className={styles.syncPending}>
              <Spinner size="sm" /> Syncing...
            </span>
          </div>
        )}
        {profileError && (
          <div className={styles.syncStatus}>
            <span className={styles.syncError}>
              Sync failed
            </span>
          </div>
        )}
      </div>

      {/* Up Next Card - Only shown if user is attending an upcoming event */}
      {upNextEvent && <UpNextCard event={upNextEvent} />}

      {/* Events Needing Response */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Needs Your Response</h2>
          <Link to="/app/events" className={styles.viewAllLink}>
            View all
          </Link>
        </div>

        {eventsLoading && !events.length ? (
          <div className={styles.loadingState}>
            <Spinner size="sm" />
            <span>Loading events...</span>
          </div>
        ) : eventsNeedingResponse.length > 0 ? (
          <div className={styles.eventsList}>
            {eventsNeedingResponse.map(event => (
              <EventItem
                key={event.id}
                event={event}
                onRsvp={rsvp}
                rsvpLoading={rsvpLoading === event.id}
              />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>✓</span>
            <span>You're all caught up!</span>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className={styles.statsGrid}>
        <Link to="/app/events" className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{upcomingCount}</span>
            <span className={styles.statLabel}>Upcoming Events</span>
          </div>
        </Link>

        <ProfileCompletionCard hasName={hasName} hasPhoto={hasPhoto} />
      </div>
    </div>
  )
}
