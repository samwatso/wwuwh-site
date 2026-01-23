import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useEvents } from '@/hooks/useEvents'
import { Spinner, Avatar } from '@/components'
import type { EventWithRsvp, RsvpResponse } from '@/types/database'
import styles from './Dashboard.module.css'

// Helper to format date
function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// Helper to format time
function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface EventItemProps {
  event: EventWithRsvp
  onRsvp: (eventId: string, response: RsvpResponse) => void
  rsvpLoading: boolean
}

function EventItem({ event, onRsvp, rsvpLoading }: EventItemProps) {
  return (
    <div className={styles.eventItem}>
      <div className={styles.eventDate}>
        <span className={styles.eventDay}>{formatEventDate(event.starts_at_utc)}</span>
        <span className={styles.eventTime}>{formatEventTime(event.starts_at_utc)}</span>
      </div>
      <div className={styles.eventInfo}>
        <span className={styles.eventTitle}>{event.title}</span>
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

export function Dashboard() {
  const { user } = useAuth()
  const { person, memberships, loading: profileLoading, error: profileError, synced } = useProfile()

  // Get club ID from first membership
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const {
    events,
    loading: eventsLoading,
    rsvp,
    rsvpLoading,
  } = useEvents({ clubId })

  // Filter events that need a response (no RSVP yet)
  const eventsNeedingResponse = useMemo(() => {
    return events.filter(e => e.my_rsvp === null).slice(0, 5)
  }, [events])

  // Count upcoming events
  const upcomingCount = events.length

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

        <Link to="/app/profile" className={styles.statCard}>
          <div className={styles.statIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className={styles.statContent}>
            <span className={styles.statValue}>{synced ? '✓' : '--'}</span>
            <span className={styles.statLabel}>Profile</span>
          </div>
        </Link>
      </div>
    </div>
  )
}
