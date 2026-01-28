import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { useEvents } from '@/hooks/useEvents'
import { useCountdown } from '@/hooks/useCountdown'
import { useAwards, Award, LockedAward } from '@/hooks/useAwards'
import { getEventAttendees, Attendee } from '@/lib/api'
import { Spinner, Avatar } from '@/components'
import { AnimatedBadge } from '@/components/badges'
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

interface EventItemProps {
  event: EventWithRsvp
  onRsvp: (eventId: string, response: RsvpResponse) => void
  rsvpLoading: boolean
}

function EventItem({ event, onRsvp, rsvpLoading }: EventItemProps) {
  return (
    <Link to="/app/events" className={styles.eventItem}>
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
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRsvp(event.id, 'yes'); }}
          disabled={rsvpLoading}
          title="Going"
        >
          {rsvpLoading ? <Spinner size="sm" /> : '✓'}
        </button>
        <button
          className={`${styles.rsvpBtn} ${styles.rsvpNo}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRsvp(event.id, 'no'); }}
          disabled={rsvpLoading}
          title="Not going"
        >
          ✗
        </button>
      </div>
    </Link>
  )
}

interface UpNextCardProps {
  event: EventWithRsvp
}

function UpNextCard({ event }: UpNextCardProps) {
  const countdown = useCountdown(event.starts_at_utc)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loadingAttendees, setLoadingAttendees] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingAttendees(true)

    getEventAttendees(event.id)
      .then(data => {
        if (!cancelled) {
          setAttendees(data.attendees.yes.slice(0, 8)) // Show up to 8 attendees
          setLoadingAttendees(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadingAttendees(false)
        }
      })

    return () => { cancelled = true }
  }, [event.id])

  return (
    <Link to={`/app/events?event=${event.id}`} className={styles.upNextCard}>
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
      </div>

      {/* Attendees */}
      {!loadingAttendees && attendees.length > 0 && (
        <div className={styles.upNextAttendees}>
          <div className={styles.attendeeAvatars}>
            {attendees.map((attendee, index) => (
              <div
                key={attendee.person_id}
                className={styles.attendeeAvatar}
                style={{ zIndex: attendees.length - index }}
              >
                <Avatar
                  src={attendee.photo_url}
                  name={attendee.name}
                  size="sm"
                />
              </div>
            ))}
          </div>
          <span className={styles.attendeeCount}>
            {event.rsvp_yes_count} going
          </span>
        </div>
      )}
    </Link>
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
    <Link to="/app/profile" className={styles.statCard}>
      <div className={`${styles.statIcon} ${isComplete ? styles.statIconSuccess : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>
          {isComplete ? 'Profile Complete' : 'Complete Profile'}
        </span>
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${isComplete ? styles.progressComplete : ''}`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className={styles.progressText}>{completion}%</span>
        </div>
      </div>
    </Link>
  )
}

interface BadgeDisplayProps {
  awardsCount: number
  currentStreak: number
  loading: boolean
  earnedAwards: Award[]
  lockedAwards: LockedAward[]
  isWide?: boolean
}

function BadgeShowcase({ awardsCount, currentStreak, loading, earnedAwards, lockedAwards, isWide }: BadgeDisplayProps) {
  const [showTrophyCase, setShowTrophyCase] = useState(false)

  // Combine earned and locked, prioritizing earned badges for display
  const earnedSet = new Set(earnedAwards.map(a => a.icon))

  // Get up to 4 badges for hive preview - prioritize earned, then locked
  const previewBadges = [
    ...earnedAwards.slice(0, 4).map(a => ({ icon: a.icon, earned: true })),
    ...lockedAwards
      .filter(a => !earnedSet.has(a.icon))
      .slice(0, Math.max(0, 4 - earnedAwards.length))
      .map(a => ({ icon: a.icon, earned: false })),
  ].slice(0, 4)

  return (
    <>
      <div
        className={`${styles.badgeShowcase} ${isWide ? styles.badgeShowcaseWide : ''}`}
        onClick={() => !loading && setShowTrophyCase(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowTrophyCase(true) }}
      >
        {/* Badge Hive Preview */}
        <div className={styles.badgeHivePreview}>
          {previewBadges.map((badge, i) => (
            <div key={badge.icon || i} className={styles.badgePreviewItem}>
              {badge.icon ? (
                <AnimatedBadge
                  icon={badge.icon}
                  size={40}
                  earned={badge.earned}
                  animate={false}
                />
              ) : (
                <div className={styles.badgePlaceholder}>?</div>
              )}
            </div>
          ))}
          {previewBadges.length === 0 && (
            <div className={styles.badgePlaceholder}>?</div>
          )}
        </div>

        {/* Info */}
        <div className={styles.badgeShowcaseInfo}>
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <>
              <span className={styles.badgeShowcaseCount}>
                {awardsCount} {awardsCount === 1 ? 'Badge' : 'Badges'}
              </span>
              <span className={styles.badgeShowcaseHint}>
                {currentStreak > 0 && `🔥 ${currentStreak} streak · `}
                Tap to view collection
              </span>
            </>
          )}
        </div>
      </div>

      {/* Badge Collection Modal */}
      {showTrophyCase && (
        <div className={styles.trophyCaseOverlay} onClick={() => setShowTrophyCase(false)}>
          <div className={styles.trophyCaseModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.trophyCaseHeader}>
              <h3 className={styles.trophyCaseTitle}>Badge Collection</h3>
              <button
                className={styles.trophyCaseClose}
                onClick={() => setShowTrophyCase(false)}
              >
                &times;
              </button>
            </div>

            <div className={styles.trophyCaseContent}>
              {/* Earned Badges */}
              {earnedAwards.map(award => (
                <div key={award.id} className={styles.trophyItem}>
                  <div className={styles.trophyBadgeWrapper}>
                    <AnimatedBadge
                      icon={award.icon || 'first_dip_round'}
                      size={64}
                      earned={true}
                      animate={true}
                    />
                  </div>
                  <div className={styles.trophyInfo}>
                    <span className={styles.trophyName}>{award.name}</span>
                    <span className={styles.trophyDesc}>{award.description}</span>
                    <span className={styles.trophyEarnedDate}>
                      ✓ Earned {new Date(award.granted_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))}

              {/* Locked Badges */}
              {lockedAwards.map(award => (
                <div key={award.id} className={styles.trophyItem}>
                  <div className={styles.trophyBadgeWrapper}>
                    <AnimatedBadge
                      icon={award.icon || 'first_dip_round'}
                      size={64}
                      earned={false}
                      animate={false}
                    />
                  </div>
                  <div className={styles.trophyInfo}>
                    <span className={styles.trophyName}>{award.name}</span>
                    <span className={styles.trophyDesc}>{award.description}</span>
                  </div>
                </div>
              ))}

              {/* Fallback if no badges */}
              {earnedAwards.length === 0 && lockedAwards.length === 0 && (
                <div className={styles.trophyEmpty}>
                  <p>No badges available yet. Keep attending sessions to earn badges!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function Dashboard() {
  const { user } = useAuth()
  const { person, memberships, loading: profileLoading, error: profileError } = useProfile()
  const { awards, lockedAwards, currentStreak, loading: awardsLoading } = useAwards()

  // Get club ID from first membership
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const {
    events,
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

      {/* Events Needing Response - only show if there are events needing response */}
      {eventsNeedingResponse.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Needs Your Response</h2>
          </div>

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
        </div>
      )}

      {/* Quick Stats */}
      <div className={styles.statsGrid}>
        <BadgeShowcase
          awardsCount={awards.length}
          currentStreak={currentStreak}
          loading={awardsLoading}
          earnedAwards={awards}
          lockedAwards={lockedAwards}
          isWide={hasName && hasPhoto}
        />
        {/* Only show profile completion card if profile is not 100% complete */}
        {!(hasName && hasPhoto) && (
          <ProfileCompletionCard hasName={hasName} hasPhoto={hasPhoto} />
        )}
      </div>
    </div>
  )
}
