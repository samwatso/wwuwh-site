/**
 * AdminEvents Page
 *
 * Manage events and recurring series.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useAdminEvents } from '@/hooks/useAdminEvents'
import { useAdminGroups } from '@/hooks/useAdminGroups'
import { useAdminMembers } from '@/hooks/useAdminMembers'
import { Spinner } from '@/components'
import type { AdminEvent, EventSeries, AdminGroup, AdminMember, ExternalEvent, PricingCategory } from '@/lib/api'
import type { EventKind } from '@/types/database'
import { PRICING_CATEGORY_LABELS } from '@/types/database'
import {
  getEventInvitations,
  addEventInvitations,
  removeEventInvitation,
  getSeriesInvitations,
  addSeriesInvitations,
  removeSeriesInvitation,
  adminCreateRsvp,
  PersonInvitation,
  GroupInvitation,
  getExternalEvents,
  promoteExternalEvent,
  ignoreExternalEvent,
  undoExternalEventDecision,
  createManualExternalEvent,
  updateManualExternalEvent,
  deleteManualExternalEvent,
  ExternalEventVisibility,
  ExternalEventStatus,
  getAdminEventDetail,
} from '@/lib/api'
import styles from './AdminEvents.module.css'

// Tab type for URL state
type EventTab = 'club' | 'uk' | 'manual'

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// localStorage keys for draft persistence
const EVENT_DRAFT_KEY = 'wwuwh_event_draft'
const SERIES_DRAFT_KEY = 'wwuwh_series_draft'

// Filter options for event list
type EventFilter = 'all' | 'session' | 'training' | 'ladies' | 'tournament'

const FILTER_OPTIONS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'session', label: 'Sessions' },
  { value: 'training', label: 'Training' },
  { value: 'ladies', label: 'Ladies' },
  { value: 'tournament', label: 'Tournaments' },
]

// Check if event matches filter (handles legacy 'match' → 'tournament')
function eventMatchesFilter(event: AdminEvent, filter: EventFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'tournament') {
    return event.kind === 'tournament' || event.kind === 'match'
  }
  return event.kind === filter
}

interface EventDraft {
  title: string
  description: string
  location: string
  kind: EventKind
  startDate: string
  startTime: string
  endTime: string
  isAllDay: boolean
  endDate: string
  paymentMode: 'included' | 'one_off' | 'free'
  feeCents: number
  visibilityDays: number
  pricingTiers?: Partial<Record<PricingCategory, number | null>>
}

interface SeriesDraft {
  title: string
  description: string
  location: string
  weekdays: number[]
  startTime: string
  endTime: string
  startDate: string
  hasEndDate: boolean
  endDate: string
  visibilityDays: number
  generateWeeks: number
}

// Helper to get weekday short names from mask
function getWeekdayNames(mask: number): string[] {
  const days: string[] = []
  WEEKDAY_NAMES.forEach((name, i) => {
    if (mask & (1 << i)) days.push(name)
  })
  return days
}

// Helper to format date compactly: "Wed 28 Jan"
function formatDateCompact(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Helper to format time: "21:00"
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// Check if event is visible to members (invite has been sent)
function isInviteSent(event: AdminEvent): boolean {
  if (!event.visible_from) return true
  return new Date(event.visible_from) <= new Date()
}

// Check if event is in the past
function isPastEvent(event: AdminEvent): boolean {
  return new Date(event.starts_at_utc) < new Date()
}

// Format RSVP count with correct grammar
function formatRsvpCount(count: number): string {
  return count === 1 ? '1 RSVP' : `${count} RSVPs`
}

// Truncate location for display
function truncateLocation(location: string | null, maxLength = 30): string {
  if (!location) return ''
  if (location.length <= maxLength) return location
  return location.slice(0, maxLength - 1) + '…'
}

// ============================================================================
// OVERFLOW MENU COMPONENT
// ============================================================================

interface OverflowMenuItem {
  label: string
  onClick: () => void
  destructive?: boolean
}

interface OverflowMenuProps {
  items: OverflowMenuItem[]
  disabled?: boolean
}

function OverflowMenu({ items, disabled }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleItemClick = (item: OverflowMenuItem) => {
    setOpen(false)
    item.onClick()
  }

  return (
    <div className={styles.overflowMenu} ref={menuRef}>
      <button
        type="button"
        className={styles.overflowBtn}
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div className={styles.overflowDropdown} role="menu">
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className={`${styles.overflowItem} ${item.destructive ? styles.overflowItemDestructive : ''}`}
              onClick={() => handleItemClick(item)}
              role="menuitem"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CONFIRM MODAL COMPONENT
// ============================================================================

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  saving?: boolean
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel, destructive, saving }: ConfirmModalProps) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.confirmTitle}>{title}</h3>
        <p className={styles.confirmMessage}>{message}</p>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={destructive ? styles.btnDanger : styles.btnPrimary}
            onClick={onConfirm}
            disabled={saving}
          >
            {saving ? <Spinner size="sm" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// FILTER BAR COMPONENT
// ============================================================================

interface FilterBarProps {
  selected: EventFilter
  onChange: (filter: EventFilter) => void
}

function FilterBar({ selected, onChange }: FilterBarProps) {
  return (
    <div className={styles.filterBar}>
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.filterChip} ${selected === opt.value ? styles.filterChipActive : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={selected === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// SERIES CARD COMPONENT
// ============================================================================

function SeriesCard({
  series,
  onEdit,
  onGenerate,
  onManageInvites,
  onDelete,
  generating,
}: {
  series: EventSeries
  onEdit: () => void
  onGenerate: () => void
  onManageInvites: () => void
  onDelete: () => void
  generating: boolean
}) {
  const weekdays = getWeekdayNames(series.weekday_mask)
  const [showConfirm, setShowConfirm] = useState(false)

  const overflowItems: OverflowMenuItem[] = [
    { label: 'Extend series', onClick: onGenerate },
    { label: 'Delete series', onClick: () => setShowConfirm(true), destructive: true },
  ]

  return (
    <>
      <div className={styles.seriesCard}>
        <div className={styles.seriesHeader}>
          <div className={styles.seriesTitleRow}>
            <h3 className={styles.seriesName}>{series.title}</h3>
            <span className={styles.upcomingBadge}>{series.upcoming_events || 0} upcoming</span>
          </div>
          <span className={styles.seriesSchedule}>
            Every {weekdays.join(', ')} at {series.start_time_local}
          </span>
        </div>

        <div className={styles.seriesMeta}>
          {series.next_event_at && (
            <span>Next: {formatDateCompact(series.next_event_at)}</span>
          )}
          {series.location && <span>{truncateLocation(series.location, 40)}</span>}
        </div>

        <div className={styles.seriesActions}>
          <button className={styles.btnPrimarySmall} onClick={onEdit}>
            Edit
          </button>
          <button className={styles.btnSecondarySmall} onClick={onManageInvites}>
            Manage invites
          </button>
          <OverflowMenu items={overflowItems} disabled={generating} />
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Delete Series"
          message="Are you sure you want to delete this series and all future events?"
          confirmLabel="Delete"
          onConfirm={() => {
            setShowConfirm(false)
            onDelete()
          }}
          onCancel={() => setShowConfirm(false)}
          destructive
        />
      )}
    </>
  )
}

// ============================================================================
// EVENT ROW COMPONENT
// ============================================================================

function EventRow({
  event,
  onEdit,
  onCancel,
  onCopy,
  onManageInvites,
  onAddAttendee,
  isPast,
}: {
  event: AdminEvent
  onEdit: () => void
  onCancel: () => void
  onCopy: () => void
  onManageInvites: () => void
  onAddAttendee: () => void
  isPast?: boolean
}) {
  const inviteSent = isInviteSent(event)
  const isCancelled = event.status === 'cancelled'
  const [showConfirm, setShowConfirm] = useState(false)

  // Build overflow menu items
  const overflowItems: OverflowMenuItem[] = [
    { label: 'Add attendee', onClick: onAddAttendee },
    { label: 'Copy', onClick: onCopy },
  ]
  if (!isCancelled && !isPast) {
    overflowItems.push({ label: 'Cancel', onClick: () => setShowConfirm(true), destructive: true })
  }

  // Status pill content
  const getStatusPill = () => {
    if (isCancelled) {
      return <span className={`${styles.statusPill} ${styles.statusPillCancelled}`}>Cancelled</span>
    }
    if (inviteSent) {
      return <span className={`${styles.statusPill} ${styles.statusPillSent}`}>Sent</span>
    }
    return (
      <span className={`${styles.statusPill} ${styles.statusPillScheduled}`}>
        Scheduled
        <span className={styles.statusPillDate}>{formatDateCompact(event.visible_from!)}</span>
      </span>
    )
  }

  return (
    <>
      <div className={`${styles.eventRow} ${isCancelled ? styles.cancelled : ''} ${isPast ? styles.past : ''}`}>
        {/* 3-line content */}
        <div className={styles.eventContent}>
          {/* Line 1: Date/Time meta */}
          <div className={styles.eventMeta}>
            {formatDateCompact(event.starts_at_utc)} · {formatTime(event.starts_at_utc)}
          </div>

          {/* Line 2: Title */}
          <div className={styles.eventTitle}>{event.title}</div>

          {/* Line 3: Status + RSVPs + Location */}
          <div className={styles.eventSecondary}>
            {getStatusPill()}
            <span className={styles.rsvpCount}>{formatRsvpCount(event.rsvp_yes_count || 0)}</span>
            {event.location && (
              <span className={styles.eventLocation}>{truncateLocation(event.location)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.eventActions}>
          <button className={styles.btnPrimarySmall} onClick={onEdit}>
            Edit
          </button>
          <button className={styles.btnSecondarySmall} onClick={onManageInvites}>
            Manage invites
          </button>
          <OverflowMenu items={overflowItems} />
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Cancel Event"
          message={`Are you sure you want to cancel "${event.title}"? Members will see it as cancelled.`}
          confirmLabel="Cancel Event"
          onConfirm={() => {
            setShowConfirm(false)
            onCancel()
          }}
          onCancel={() => setShowConfirm(false)}
          destructive
        />
      )}
    </>
  )
}

// ============================================================================
// EXTERNAL EVENT CARD (UK Events)
// ============================================================================

interface ExternalEventCardProps {
  event: ExternalEvent
  onPromote: () => void
  onIgnore: () => void
  onUndo: () => void
  processing: boolean
}

function ExternalEventCard({ event, onPromote, onIgnore, onUndo, processing }: ExternalEventCardProps) {
  const isPromoted = event.decision === 'promoted'
  const isIgnored = event.decision === 'ignored'
  const hasDecision = isPromoted || isIgnored

  return (
    <div className={`${styles.externalEventCard} ${isIgnored ? styles.externalIgnored : ''} ${isPromoted ? styles.externalPromoted : ''}`}>
      <div className={styles.externalEventContent}>
        {/* Date/Time meta */}
        <div className={styles.eventMeta}>
          {formatDateCompact(event.starts_at_utc)}
          {event.ends_at_utc && ` · ${formatTime(event.starts_at_utc)}`}
        </div>

        {/* Title */}
        <div className={styles.eventTitle}>{event.title}</div>

        {/* Location */}
        {event.location && (
          <div className={styles.externalEventLocation}>{event.location}</div>
        )}

        {/* Status badge */}
        {hasDecision && (
          <div className={styles.externalDecisionBadge}>
            {isPromoted && <span className={styles.decisionPromoted}>Promoted</span>}
            {isIgnored && <span className={styles.decisionIgnored}>Ignored</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={styles.externalEventActions}>
        {!hasDecision ? (
          <>
            <button
              className={styles.btnPrimarySmall}
              onClick={onPromote}
              disabled={processing}
            >
              {processing ? <Spinner size="sm" /> : 'Promote'}
            </button>
            <button
              className={styles.btnGhostSmall}
              onClick={onIgnore}
              disabled={processing}
            >
              Ignore
            </button>
          </>
        ) : (
          <button
            className={styles.btnGhostSmall}
            onClick={onUndo}
            disabled={processing}
          >
            {processing ? <Spinner size="sm" /> : 'Undo'}
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MANUAL EVENT CARD (with Edit action)
// ============================================================================

interface ManualEventCardProps {
  event: ExternalEvent
  onEdit: () => void
  onPromote: () => void
  onIgnore: () => void
  onUndo: () => void
  onDelete: () => void
  processing: boolean
}

function ManualEventCard({ event, onEdit, onPromote, onIgnore, onUndo, onDelete, processing }: ManualEventCardProps) {
  const isPromoted = event.decision === 'promoted'
  const isIgnored = event.decision === 'ignored'
  const hasDecision = isPromoted || isIgnored
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  // Source label mapping
  const sourceLabels: Record<string, string> = {
    intl_comp: 'International',
    coach_private: 'Coach',
    other: 'Other',
  }
  const sourceLabel = sourceLabels[event.source] || event.source

  // Visibility badge
  const visibilityLabels: Record<string, string> = {
    public: 'Public',
    admin_only: 'Admin only',
    coach_only: 'Coach only',
  }
  const visibilityLabel = event.visibility ? visibilityLabels[event.visibility] : null

  return (
    <>
      <div className={`${styles.externalEventCard} ${isIgnored ? styles.externalIgnored : ''} ${isPromoted ? styles.externalPromoted : ''}`}>
        <div className={styles.externalEventContent}>
          {/* Date/Time meta */}
          <div className={styles.eventMeta}>
            {formatDateCompact(event.starts_at_utc)}
            {event.ends_at_utc && ` · ${formatTime(event.starts_at_utc)}`}
            {sourceLabel && <span className={styles.sourceTag}>{sourceLabel}</span>}
          </div>

          {/* Title */}
          <div className={styles.eventTitle}>{event.title}</div>

          {/* Location */}
          {event.location && (
            <div className={styles.externalEventLocation}>{event.location}</div>
          )}

          {/* Badges row */}
          <div className={styles.manualEventBadges}>
            {visibilityLabel && (
              <span className={styles.visibilityBadge}>{visibilityLabel}</span>
            )}
            {event.status === 'cancelled' && (
              <span className={styles.statusCancelled}>Cancelled</span>
            )}
            {event.status === 'tentative' && (
              <span className={styles.statusTentative}>Tentative</span>
            )}
            {hasDecision && (
              <>
                {isPromoted && <span className={styles.decisionPromoted}>Promoted</span>}
                {isIgnored && <span className={styles.decisionIgnored}>Ignored</span>}
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.externalEventActions}>
          <button
            className={styles.btnSecondarySmall}
            onClick={onEdit}
            disabled={processing}
          >
            Edit
          </button>
          {!hasDecision ? (
            <>
              <button
                className={styles.btnPrimarySmall}
                onClick={onPromote}
                disabled={processing}
              >
                {processing ? <Spinner size="sm" /> : 'Promote'}
              </button>
              <button
                className={styles.btnGhostSmall}
                onClick={onIgnore}
                disabled={processing}
              >
                Ignore
              </button>
            </>
          ) : (
            <button
              className={styles.btnGhostSmall}
              onClick={onUndo}
              disabled={processing}
            >
              {processing ? <Spinner size="sm" /> : 'Undo'}
            </button>
          )}
          <button
            className={styles.btnDangerSmall}
            onClick={() => setShowConfirmDelete(true)}
            disabled={processing}
            title="Delete"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {showConfirmDelete && (
        <ConfirmModal
          title="Delete Event"
          message={`Are you sure you want to delete "${event.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setShowConfirmDelete(false)
            onDelete()
          }}
          onCancel={() => setShowConfirmDelete(false)}
          destructive
        />
      )}
    </>
  )
}

// ============================================================================
// MANUAL EVENT MODAL (Create/Edit)
// ============================================================================

// Source options for manual events
const MANUAL_SOURCE_OPTIONS = [
  { value: 'intl_comp', label: 'International Competition' },
  { value: 'coach_private', label: 'Coach / Private' },
  { value: 'other', label: 'Other' },
]

// Visibility options
const VISIBILITY_OPTIONS: { value: ExternalEventVisibility; label: string }[] = [
  { value: 'admin_only', label: 'Admin only (default)' },
  { value: 'coach_only', label: 'Coach only' },
  { value: 'public', label: 'Public' },
]

// Status options
const STATUS_OPTIONS: { value: ExternalEventStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface ManualEventModalProps {
  event: ExternalEvent | null
  onSave: (data: {
    title: string
    description?: string | null
    location?: string | null
    url?: string | null
    source?: string
    starts_at_utc: string
    ends_at_utc?: string | null
    status?: ExternalEventStatus
    visibility?: ExternalEventVisibility
  }) => void
  onClose: () => void
  saving: boolean
}

function ManualEventModal({ event, onSave, onClose, saving }: ManualEventModalProps) {
  const isEdit = !!event

  // Parse existing event data or use defaults
  const defaultStart = new Date()
  defaultStart.setHours(9, 0, 0, 0)
  defaultStart.setDate(defaultStart.getDate() + 14)

  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [location, setLocation] = useState(event?.location || '')
  const [url, setUrl] = useState(event?.url || '')
  const [source, setSource] = useState(event?.source || 'other')
  const [visibility, setVisibility] = useState<ExternalEventVisibility>((event?.visibility as ExternalEventVisibility) || 'admin_only')
  const [status, setStatus] = useState<ExternalEventStatus>((event?.status as ExternalEventStatus) || 'active')

  const [startDate, setStartDate] = useState(() => {
    if (event?.starts_at_utc) {
      return event.starts_at_utc.slice(0, 10)
    }
    return defaultStart.toISOString().slice(0, 10)
  })

  const [startTime, setStartTime] = useState(() => {
    if (event?.starts_at_utc) {
      return formatTime(event.starts_at_utc)
    }
    return '09:00'
  })

  const [hasEndTime, setHasEndTime] = useState(!!event?.ends_at_utc)
  const [endDate, setEndDate] = useState(() => {
    if (event?.ends_at_utc) {
      return event.ends_at_utc.slice(0, 10)
    }
    return startDate
  })
  const [endTime, setEndTime] = useState(() => {
    if (event?.ends_at_utc) {
      return formatTime(event.ends_at_utc)
    }
    return '17:00'
  })

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !startDate) return

    const startsAt = new Date(`${startDate}T${startTime}:00`)
    let endsAt: Date | null = null
    if (hasEndTime && endDate && endTime) {
      endsAt = new Date(`${endDate}T${endTime}:00`)
    }

    onSave({
      title,
      description: description || null,
      location: location || null,
      url: url || null,
      source,
      starts_at_utc: startsAt.toISOString(),
      ends_at_utc: endsAt ? endsAt.toISOString() : null,
      status,
      visibility,
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? 'Edit External Event' : 'Add External Event'}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {/* Title */}
            <div className={styles.formSection}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. European Championships 2026"
                  required
                />
              </div>
            </div>

            {/* Source & Visibility */}
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Source</label>
                  <select
                    className={styles.formInput}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    {MANUAL_SOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Visibility</label>
                  <select
                    className={styles.formInput}
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as ExternalEventVisibility)}
                  >
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* When */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>When</div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Start Date *</label>
                  <input
                    type="date"
                    className={styles.formInput}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Start Time</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={hasEndTime}
                    onChange={(e) => setHasEndTime(e.target.checked)}
                  />
                  Has end date/time
                </label>
              </div>

              {hasEndTime && (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>End Date</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>End Time</label>
                    <input
                      type="time"
                      className={styles.formInput}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Location */}
            <div className={styles.formSection}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Location</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Zagreb, Croatia"
                />
              </div>
            </div>

            {/* URL */}
            <div className={styles.formSection}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Event URL</label>
                <input
                  type="url"
                  className={styles.formInput}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Description */}
            <div className={styles.formSection}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  className={styles.formInput}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional notes about the event..."
                />
              </div>
            </div>

            {/* Status (only show in edit mode) */}
            {isEdit && (
              <div className={styles.formSection}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Status</label>
                  <select
                    className={styles.formInput}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ExternalEventStatus)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving || !title}>
              {saving ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// SAVED VENUES LIST
// ============================================================================

const SAVED_VENUES = [
  'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EW',
  'South Norwood Leisure Centre, Portland Rd, London SE25 4PT',
  'K2 Crawley, Pease Pottage Hill, Crawley RH11 9BQ',
  'John Charles Centre for Sport, Leeds LS11 5DJ',
  'Ponds Forge International Sports Centre, Sheffield S1 2BP',
]

// Type-based defaults for CREATE mode
const TYPE_DEFAULTS: Record<EventKind, {
  durationMin: number
  paymentMode: 'included' | 'one_off' | 'free'
  visibilityDays: number
  isAllDay: boolean
}> = {
  session: { durationMin: 60, paymentMode: 'included', visibilityDays: 5, isAllDay: false },
  ladies: { durationMin: 120, paymentMode: 'one_off', visibilityDays: 60, isAllDay: false },
  training: { durationMin: 120, paymentMode: 'one_off', visibilityDays: 60, isAllDay: false },
  tournament: { durationMin: 0, paymentMode: 'one_off', visibilityDays: 90, isAllDay: true },
  social: { durationMin: 60, paymentMode: 'free', visibilityDays: 90, isAllDay: false },
  other: { durationMin: 60, paymentMode: 'free', visibilityDays: 90, isAllDay: false },
  match: { durationMin: 60, paymentMode: 'free', visibilityDays: 90, isAllDay: false }, // legacy
}

// Calculate end time from start time and duration
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m + minutes
  const newH = Math.floor(totalMin / 60) % 24
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

// ============================================================================
// VENUE AUTOCOMPLETE COMPONENT
// ============================================================================

interface VenueAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onTouched?: () => void
  className?: string
}

function VenueAutocomplete({ value, onChange, onTouched, className }: VenueAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredVenues, setFilteredVenues] = useState<string[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter venues based on input
  useEffect(() => {
    if (value.length > 0) {
      const filtered = SAVED_VENUES.filter(v =>
        v.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredVenues(filtered)
    } else {
      setFilteredVenues(SAVED_VENUES)
    }
  }, [value])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSuggestions])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowSuggestions(false)
    }
    if (showSuggestions) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [showSuggestions])

  const handleSelect = (venue: string) => {
    onChange(venue)
    setShowSuggestions(false)
    onTouched?.()
  }

  return (
    <div className={styles.venueAutocomplete} ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          onTouched?.()
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder="Start typing or select a saved venue..."
      />
      {showSuggestions && filteredVenues.length > 0 && (
        <div className={styles.venueSuggestions}>
          {filteredVenues.map((venue, idx) => (
            <button
              key={idx}
              type="button"
              className={styles.venueSuggestionItem}
              onClick={() => handleSelect(venue)}
            >
              {venue}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CREATE/EDIT EVENT MODAL
// ============================================================================

function EventModal({
  event,
  copyFrom,
  onSave,
  onClose,
  saving,
}: {
  event: AdminEvent | null
  copyFrom?: AdminEvent | null
  onSave: (data: {
    title: string
    description?: string
    location?: string
    kind?: EventKind
    starts_at_utc: string
    ends_at_utc: string
    payment_mode?: 'included' | 'one_off' | 'free'
    fee_cents?: number
    visible_from?: string
    pricing_tiers?: Partial<Record<PricingCategory, number | null>>
  }) => void
  onClose: () => void
  saving: boolean
}) {
  const isEdit = !!event
  const isCopy = !!copyFrom
  const sourceEvent = event || copyFrom
  const isCreate = !isEdit && !isCopy

  // Parse existing event data or use defaults
  const defaultStart = new Date()
  defaultStart.setHours(21, 0, 0, 0)
  defaultStart.setDate(defaultStart.getDate() + 7)

  const defaultEnd = new Date(defaultStart)
  defaultEnd.setMinutes(defaultEnd.getMinutes() + 90)

  const defaultVisible = new Date(defaultStart)
  defaultVisible.setDate(defaultVisible.getDate() - 5)

  // Load saved draft for new events (not edit or copy)
  const savedDraft = isCreate ? (() => {
    try {
      const stored = localStorage.getItem(EVENT_DRAFT_KEY)
      return stored ? JSON.parse(stored) as EventDraft : null
    } catch {
      return null
    }
  })() : null

  // Track which fields have been manually touched (for type-based defaults)
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())
  const markTouched = (field: string) => {
    setTouchedFields(prev => new Set(prev).add(field))
  }

  const [title, setTitle] = useState(sourceEvent?.title || savedDraft?.title || '')
  const [description, setDescription] = useState(sourceEvent?.description || savedDraft?.description || '')
  const [location, setLocation] = useState(sourceEvent?.location || savedDraft?.location || '')

  // Map legacy 'match' to 'tournament' when editing
  const initialKind = sourceEvent?.kind === 'match' ? 'tournament' : (sourceEvent?.kind || savedDraft?.kind || 'session')
  const [kind, setKind] = useState<EventKind>(initialKind)

  // For copying, default to next week same day; for edit use existing date
  const [startDate, setStartDate] = useState(() => {
    if (isEdit && event?.starts_at_utc) {
      return event.starts_at_utc.slice(0, 10)
    }
    if (isCopy && copyFrom?.starts_at_utc) {
      const original = new Date(copyFrom.starts_at_utc)
      original.setDate(original.getDate() + 7)
      return original.toISOString().slice(0, 10)
    }
    if (savedDraft?.startDate) {
      return savedDraft.startDate
    }
    return defaultStart.toISOString().slice(0, 10)
  })

  const [startTime, setStartTime] = useState(
    sourceEvent?.starts_at_utc ? formatTime(sourceEvent.starts_at_utc) : savedDraft?.startTime || '21:00'
  )

  const [endTime, setEndTime] = useState(() => {
    if (sourceEvent?.ends_at_utc) {
      return formatTime(sourceEvent.ends_at_utc)
    }
    if (savedDraft?.endTime) return savedDraft.endTime
    return '22:00'
  })

  const [isAllDay, setIsAllDay] = useState(() => {
    if (sourceEvent) {
      const start = new Date(sourceEvent.starts_at_utc)
      const end = new Date(sourceEvent.ends_at_utc)
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      return diffHours >= 24
    }
    return savedDraft?.isAllDay || false
  })

  const [endDate, setEndDate] = useState(() => {
    if (sourceEvent?.ends_at_utc) {
      return sourceEvent.ends_at_utc.slice(0, 10)
    }
    if (savedDraft?.endDate) return savedDraft.endDate
    return ''
  })

  const [paymentMode, setPaymentMode] = useState<'included' | 'one_off' | 'free'>(
    sourceEvent?.payment_mode || savedDraft?.paymentMode || 'included'
  )
  const [feeCents, setFeeCents] = useState(sourceEvent?.fee_cents || savedDraft?.feeCents || 0)
  const [pricingTiers, setPricingTiers] = useState<Partial<Record<PricingCategory, number | null>>>(() => {
    // Convert pricing_tiers array to record format for the form
    if (sourceEvent?.pricing_tiers && sourceEvent.pricing_tiers.length > 0) {
      const record: Partial<Record<PricingCategory, number | null>> = {}
      for (const tier of sourceEvent.pricing_tiers) {
        record[tier.category] = tier.price_cents
      }
      return record
    }
    return savedDraft?.pricingTiers || {}
  })
  const [visibilityDays, setVisibilityDays] = useState(() => {
    // For edit/copy, calculate from existing event's visible_from
    if (sourceEvent?.visible_from && sourceEvent?.starts_at_utc) {
      const start = new Date(sourceEvent.starts_at_utc).getTime()
      const visible = new Date(sourceEvent.visible_from).getTime()
      const days = Math.round((start - visible) / (24 * 60 * 60 * 1000))
      return days > 0 ? days : 5
    }
    if (savedDraft?.visibilityDays) return savedDraft.visibilityDays
    return 5
  })

  // Collapsible options section (collapsed by default on create)
  const [optionsExpanded, setOptionsExpanded] = useState(isEdit || isCopy)

  // Handle type change - apply defaults for untouched fields (CREATE mode only)
  const handleTypeChange = (newKind: EventKind) => {
    setKind(newKind)

    // Only apply defaults in CREATE mode for untouched fields
    if (!isCreate) return

    const defaults = TYPE_DEFAULTS[newKind]

    // Apply all-day setting
    if (!touchedFields.has('isAllDay')) {
      setIsAllDay(defaults.isAllDay)
      if (defaults.isAllDay && !endDate) {
        setEndDate(startDate)
      }
    }

    // Apply end time based on duration (only if not all-day)
    if (!touchedFields.has('endTime') && !defaults.isAllDay && defaults.durationMin > 0) {
      setEndTime(addMinutesToTime(startTime, defaults.durationMin))
    }

    // Apply payment mode
    if (!touchedFields.has('paymentMode')) {
      setPaymentMode(defaults.paymentMode)
    }

    // Apply visibility days
    if (!touchedFields.has('visibilityDays')) {
      setVisibilityDays(defaults.visibilityDays)
    }
  }

  // Keep a ref to current values for saving on unmount
  const draftRef = useRef<EventDraft>({
    title,
    description,
    location,
    kind,
    startDate,
    startTime,
    endTime,
    isAllDay,
    endDate,
    paymentMode,
    feeCents,
    visibilityDays,
  })

  // Update ref whenever values change
  useEffect(() => {
    draftRef.current = {
      title,
      description,
      location,
      kind,
      startDate,
      startTime,
      endTime,
      isAllDay,
      endDate,
      paymentMode,
      feeCents,
      visibilityDays,
      pricingTiers,
    }
  }, [title, description, location, kind, startDate, startTime, endTime, isAllDay, endDate, paymentMode, feeCents, visibilityDays, pricingTiers])

  // Save draft to localStorage when values change (only for new events)
  useEffect(() => {
    if (isEdit || isCopy) return
    localStorage.setItem(EVENT_DRAFT_KEY, JSON.stringify(draftRef.current))
  }, [isEdit, isCopy, title, description, location, kind, startDate, startTime, endTime, isAllDay, endDate, paymentMode, feeCents, visibilityDays, pricingTiers])

  // Save draft on unmount (catches navigation away)
  useEffect(() => {
    return () => {
      if (!isEdit && !isCopy) {
        localStorage.setItem(EVENT_DRAFT_KEY, JSON.stringify(draftRef.current))
      }
    }
  }, [isEdit, isCopy])

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Clear draft helper
  const clearDraft = () => {
    localStorage.removeItem(EVENT_DRAFT_KEY)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !startDate) return
    if (!isAllDay && (!startTime || !endTime)) return
    if (isAllDay && !endDate) return

    let startsAt: Date
    let endsAt: Date

    if (isAllDay) {
      startsAt = new Date(`${startDate}T00:00:00`)
      endsAt = new Date(`${endDate}T23:59:59`)
    } else {
      startsAt = new Date(`${startDate}T${startTime}:00`)
      endsAt = new Date(`${startDate}T${endTime}:00`)
      if (endsAt <= startsAt) {
        endsAt.setDate(endsAt.getDate() + 1)
      }
    }

    const visibleFrom = new Date(startsAt.getTime() - visibilityDays * 24 * 60 * 60 * 1000)

    clearDraft()

    onSave({
      title,
      description: description || undefined,
      location: location || undefined,
      kind,
      starts_at_utc: startsAt.toISOString(),
      ends_at_utc: endsAt.toISOString(),
      payment_mode: paymentMode,
      fee_cents: paymentMode === 'one_off' ? feeCents : undefined,
      visible_from: visibleFrom.toISOString(),
      pricing_tiers: paymentMode === 'one_off' ? pricingTiers : undefined,
    })
  }

  const handleClearDraft = () => {
    clearDraft()
    setTitle('')
    setDescription('')
    setLocation('')
    setKind('session')
    setStartDate(defaultStart.toISOString().slice(0, 10))
    setStartTime('21:00')
    setEndTime('22:00')
    setIsAllDay(false)
    setEndDate('')
    setPaymentMode('included')
    setFeeCents(0)
    setVisibilityDays(5)
    setTouchedFields(new Set())
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? 'Edit Event' : isCopy ? 'Copy Event' : 'Create Event'}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {/* SECTION: Type (first for CREATE) */}
            <div className={styles.formSection}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Type</label>
                  <select
                    className={styles.formInput}
                    value={kind}
                    onChange={(e) => handleTypeChange(e.target.value as EventKind)}
                  >
                    <option value="session">Session</option>
                    <option value="training">Training</option>
                    <option value="ladies">Ladies</option>
                    <option value="tournament">Tournament</option>
                    <option value="social">Social</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Title</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Tuesday Session"
                    required
                  />
                </div>
              </div>
            </div>

            {/* SECTION: When */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>When</div>

              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isAllDay}
                    onChange={(e) => {
                      setIsAllDay(e.target.checked)
                      markTouched('isAllDay')
                      if (e.target.checked && !endDate) {
                        setEndDate(startDate)
                      }
                    }}
                  />
                  <span>All-day / Multi-day event</span>
                </label>
              </div>

              {isAllDay ? (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Start Date</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value)
                        if (endDate && e.target.value > endDate) {
                          setEndDate(e.target.value)
                        }
                      }}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>End Date</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Date</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Start</label>
                    <input
                      type="time"
                      className={styles.formInput}
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value)
                        // Auto-update end time if not touched
                        if (!touchedFields.has('endTime') && isCreate) {
                          const defaults = TYPE_DEFAULTS[kind]
                          if (defaults.durationMin > 0) {
                            setEndTime(addMinutesToTime(e.target.value, defaults.durationMin))
                          }
                        }
                      }}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>End</label>
                    <input
                      type="time"
                      className={styles.formInput}
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value)
                        markTouched('endTime')
                      }}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SECTION: Where */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>Where</div>
              <div className={styles.formGroup}>
                <VenueAutocomplete
                  value={location}
                  onChange={setLocation}
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* SECTION: Details */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>Details</div>
              <div className={styles.formGroup}>
                <textarea
                  className={styles.formTextarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
            </div>

            {/* SECTION: Options (collapsible) */}
            <div className={styles.formSection}>
              <button
                type="button"
                className={styles.formSectionToggle}
                onClick={() => setOptionsExpanded(!optionsExpanded)}
                aria-expanded={optionsExpanded}
              >
                <span>Options</span>
                <svg
                  className={`${styles.chevronIcon} ${optionsExpanded ? styles.chevronExpanded : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="16"
                  height="16"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {optionsExpanded && (
                <div className={styles.formSectionContent}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Payment</label>
                      <select
                        className={styles.formInput}
                        value={paymentMode}
                        onChange={(e) => {
                          setPaymentMode(e.target.value as typeof paymentMode)
                          markTouched('paymentMode')
                        }}
                      >
                        <option value="included">Included in subscription</option>
                        <option value="one_off">One-off payment</option>
                        <option value="free">Free</option>
                      </select>
                    </div>
                    {paymentMode === 'one_off' && (
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Default Fee (pence)</label>
                        <input
                          type="number"
                          className={styles.formInput}
                          value={feeCents}
                          onChange={(e) => setFeeCents(parseInt(e.target.value) || 0)}
                          min={0}
                        />
                        <p className={styles.formHint}>Fallback price if no category tier is set</p>
                      </div>
                    )}
                  </div>
                  {paymentMode === 'one_off' && (
                    <div className={styles.formRow}>
                      <div className={styles.formGroup} style={{ flex: 1 }}>
                        <label className={styles.formLabel}>Pricing Tiers (pence per category)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {(Object.keys(PRICING_CATEGORY_LABELS) as PricingCategory[]).map(cat => (
                            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <label style={{ width: '60px', fontSize: '13px' }}>{PRICING_CATEGORY_LABELS[cat]}</label>
                              <input
                                type="number"
                                className={styles.formInput}
                                value={pricingTiers[cat] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setPricingTiers(prev => ({
                                    ...prev,
                                    [cat]: val === '' ? null : parseInt(val) || 0
                                  }))
                                }}
                                min={0}
                                placeholder="—"
                                style={{ flex: 1 }}
                              />
                            </div>
                          ))}
                        </div>
                        <p className={styles.formHint}>Leave blank to use fallback rules (e.g., senior → adult)</p>
                      </div>
                    </div>
                  )}
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Visibility (days before event)</label>
                      <input
                        type="number"
                        className={styles.formInput}
                        value={visibilityDays}
                        onChange={(e) => {
                          setVisibilityDays(parseInt(e.target.value) || 5)
                          markTouched('visibilityDays')
                        }}
                        min={0}
                        max={365}
                      />
                      <p className={styles.formHint}>
                        Event will be visible to members this many days before it starts
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.modalFooterSticky}>
            {isCreate && savedDraft && (
              <button type="button" className={styles.btnDangerOutline} onClick={handleClearDraft}>
                Clear Draft
              </button>
            )}
            <div className={styles.modalFooterRight}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : isCopy ? 'Copy Event' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// CREATE/EDIT SERIES MODAL
// ============================================================================

function SeriesModal({
  series,
  onSave,
  onClose,
  onDelete,
  saving,
}: {
  series: EventSeries | null
  onSave: (data: {
    title: string
    description?: string
    location?: string
    weekday_mask: number
    start_time_local: string
    duration_min?: number
    start_date: string
    end_date?: string
    visibility_days?: number
    default_fee_cents?: number
    generate_weeks?: number
  }) => void
  onClose: () => void
  onDelete?: () => void
  saving: boolean
}) {
  const isEdit = !!series
  const isCreate = !isEdit

  // Load saved draft for new series (not edit)
  const savedDraft = isCreate ? (() => {
    try {
      const stored = localStorage.getItem(SERIES_DRAFT_KEY)
      return stored ? JSON.parse(stored) as SeriesDraft : null
    } catch {
      return null
    }
  })() : null

  const [title, setTitle] = useState(series?.title || savedDraft?.title || '')
  const [description, setDescription] = useState(series?.description || savedDraft?.description || '')
  const [location, setLocation] = useState(series?.location || savedDraft?.location || '')
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    if (series) {
      const days: number[] = []
      for (let i = 0; i < 7; i++) {
        if (series.weekday_mask & (1 << i)) days.push(i)
      }
      return days
    }
    if (savedDraft?.weekdays) return savedDraft.weekdays
    return [2] // Default to Tuesday
  })
  const [startTime, setStartTime] = useState(series?.start_time_local || savedDraft?.startTime || '20:00')
  const [endTime, setEndTime] = useState(() => {
    // Calculate end time from start time + duration
    if (series?.start_time_local && series?.duration_min) {
      return addMinutesToTime(series.start_time_local, series.duration_min)
    }
    if (savedDraft?.endTime) return savedDraft.endTime
    return '21:30' // Default 1.5 hours after 20:00
  })
  const [startDate, setStartDate] = useState(
    series?.start_date || savedDraft?.startDate || new Date().toISOString().slice(0, 10)
  )
  const [hasEndDate, setHasEndDate] = useState(series?.end_date ? true : savedDraft?.hasEndDate || false)
  const [endDate, setEndDate] = useState(series?.end_date || savedDraft?.endDate || '')
  const [visibilityDays, setVisibilityDays] = useState(series?.visibility_days ?? savedDraft?.visibilityDays ?? 5)
  const feeCents = series?.default_fee_cents || 0
  const [generateWeeks, setGenerateWeeks] = useState(savedDraft?.generateWeeks || 8)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Collapsible options section (collapsed by default on create)
  const [optionsExpanded, setOptionsExpanded] = useState(isEdit)

  // Keep a ref to current values for saving on unmount
  const draftRef = useRef<SeriesDraft>({
    title,
    description,
    location,
    weekdays,
    startTime,
    endTime,
    startDate,
    hasEndDate,
    endDate,
    visibilityDays,
    generateWeeks,
  })

  // Update ref whenever values change
  useEffect(() => {
    draftRef.current = {
      title,
      description,
      location,
      weekdays,
      startTime,
      endTime,
      startDate,
      hasEndDate,
      endDate,
      visibilityDays,
      generateWeeks,
    }
  }, [title, description, location, weekdays, startTime, endTime, startDate, hasEndDate, endDate, visibilityDays, generateWeeks])

  // Save draft to localStorage when values change (only for new series)
  useEffect(() => {
    if (isEdit) return
    localStorage.setItem(SERIES_DRAFT_KEY, JSON.stringify(draftRef.current))
  }, [isEdit, title, description, location, weekdays, startTime, endTime, startDate, hasEndDate, endDate, visibilityDays, generateWeeks])

  // Save draft on unmount (catches navigation away)
  useEffect(() => {
    return () => {
      if (!isEdit) {
        localStorage.setItem(SERIES_DRAFT_KEY, JSON.stringify(draftRef.current))
      }
    }
  }, [isEdit])

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Clear draft helper
  const clearDraft = () => {
    localStorage.removeItem(SERIES_DRAFT_KEY)
  }

  const handleClearDraft = () => {
    clearDraft()
    setTitle('')
    setDescription('')
    setLocation('')
    setWeekdays([2])
    setStartTime('20:00')
    setEndTime('21:30')
    setStartDate(new Date().toISOString().slice(0, 10))
    setHasEndDate(false)
    setEndDate('')
    setVisibilityDays(5)
    setGenerateWeeks(8)
  }

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  // Calculate duration in minutes from start and end time
  const calculateDuration = (start: string, end: string): number => {
    const [startH, startM] = start.split(':').map(Number)
    const [endH, endM] = end.split(':').map(Number)
    let duration = (endH * 60 + endM) - (startH * 60 + startM)
    // Handle overnight events
    if (duration <= 0) duration += 24 * 60
    return duration
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || weekdays.length === 0 || !startTime || !endTime || !startDate) return

    // Calculate weekday mask
    const weekdayMask = weekdays.reduce((mask, day) => mask | (1 << day), 0)

    // Calculate duration from start and end time
    const durationMin = calculateDuration(startTime, endTime)

    // Clear draft before saving
    clearDraft()

    onSave({
      title,
      description: description || undefined,
      location: location || undefined,
      weekday_mask: weekdayMask,
      start_time_local: startTime,
      duration_min: durationMin,
      start_date: startDate,
      end_date: hasEndDate && endDate ? endDate : undefined,
      visibility_days: visibilityDays,
      default_fee_cents: feeCents || undefined,
      generate_weeks: isEdit ? undefined : generateWeeks,
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? 'Edit Series' : 'Create Recurring Series'}</h3>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {/* SECTION: Basics */}
            <div className={styles.formSection}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Tuesday Session"
                  required
                />
              </div>
            </div>

            {/* SECTION: When */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>When</div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Days of Week</label>
                <div className={styles.weekdayPicker}>
                  {WEEKDAY_NAMES.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      className={`${styles.weekdayBtn} ${weekdays.includes(i) ? styles.active : ''}`}
                      onClick={() => toggleWeekday(i)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Start</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Starting From</label>
                  <input
                    type="date"
                    className={styles.formInput}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={hasEndDate}
                      onChange={(e) => setHasEndDate(e.target.checked)}
                    />
                    <span>Has End Date</span>
                  </label>
                  {hasEndDate && (
                    <input
                      type="date"
                      className={styles.formInput}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* SECTION: Where */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>Where</div>
              <div className={styles.formGroup}>
                <VenueAutocomplete
                  value={location}
                  onChange={setLocation}
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* SECTION: Details */}
            <div className={styles.formSection}>
              <div className={styles.formSectionHeader}>Details</div>
              <div className={styles.formGroup}>
                <textarea
                  className={styles.formTextarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                />
              </div>
            </div>

            {/* SECTION: Options (collapsible) */}
            <div className={styles.formSection}>
              <button
                type="button"
                className={styles.formSectionToggle}
                onClick={() => setOptionsExpanded(!optionsExpanded)}
                aria-expanded={optionsExpanded}
              >
                <span>Options</span>
                <svg
                  className={`${styles.chevronIcon} ${optionsExpanded ? styles.chevronExpanded : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="16"
                  height="16"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {optionsExpanded && (
                <div className={styles.formSectionContent}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Visibility (days before event)</label>
                      <input
                        type="number"
                        className={styles.formInput}
                        value={visibilityDays}
                        onChange={(e) => setVisibilityDays(parseInt(e.target.value) || 5)}
                        min={0}
                        max={365}
                      />
                      <p className={styles.formHint}>
                        Events will be visible to members this many days before they start
                      </p>
                    </div>
                  </div>

                  {isCreate && (
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Generate events for (weeks)</label>
                        <input
                          type="number"
                          className={styles.formInput}
                          value={generateWeeks}
                          onChange={(e) => setGenerateWeeks(parseInt(e.target.value) || 8)}
                          min={1}
                          max={52}
                        />
                        <p className={styles.formHint}>
                          Number of weeks of events to create initially
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Deep End for edit mode */}
                  {isEdit && onDelete && (
                    <div className={styles.dangerZone}>
                      <h4 className={styles.dangerZoneTitle}>Deep End</h4>
                      <button
                        type="button"
                        className={styles.btnDangerOutline}
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        Delete Series
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.modalFooterSticky}>
            {isCreate && savedDraft && (
              <button type="button" className={styles.btnDangerOutline} onClick={handleClearDraft}>
                Clear Draft
              </button>
            )}
            <div className={styles.modalFooterRight}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Series'}
              </button>
            </div>
          </div>
        </form>

        {showDeleteConfirm && onDelete && (
          <ConfirmModal
            title="Delete Series"
            message="Are you sure you want to delete this series and all future events? This cannot be undone."
            confirmLabel="Delete"
            onConfirm={() => {
              setShowDeleteConfirm(false)
              onDelete()
            }}
            onCancel={() => setShowDeleteConfirm(false)}
            destructive
            saving={saving}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// INVITATION MODAL
// ============================================================================

function InvitationModal({
  title,
  type,
  targetId,
  clubId,
  allMembers,
  allGroups,
  onClose,
}: {
  title: string
  type: 'event' | 'series'
  targetId: string
  clubId: string
  allMembers: AdminMember[]
  allGroups: AdminGroup[]
  onClose: () => void
}) {
  const [personInvitations, setPersonInvitations] = useState<PersonInvitation[]>([])
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{
    type: 'person' | 'group'
    id: string
    personId?: string
    groupId?: string
  } | null>(null)

  // Load invitations
  useEffect(() => {
    const loadInvitations = async () => {
      setLoading(true)
      try {
        const response = type === 'event'
          ? await getEventInvitations(targetId, clubId)
          : await getSeriesInvitations(targetId, clubId)
        setPersonInvitations(response.invitations.persons)
        setGroupInvitations(response.invitations.groups)
      } catch (err) {
        console.error('Failed to load invitations:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInvitations()
  }, [type, targetId, clubId])

  // Get available members (not already invited)
  const invitedPersonIds = new Set(personInvitations.map((p) => p.person_id))
  const availableMembers = allMembers.filter((m) => !invitedPersonIds.has(m.person_id))
  const filteredMembers = search
    ? availableMembers.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.email.toLowerCase().includes(search.toLowerCase())
      )
    : availableMembers

  // Get available groups (not already invited)
  const invitedGroupIds = new Set(groupInvitations.map((g) => g.group_id))
  const availableGroups = allGroups.filter((g) => !invitedGroupIds.has(g.id))

  const handleAddPerson = async (personId: string) => {
    setSaving(true)
    try {
      if (type === 'event') {
        await addEventInvitations(targetId, clubId, [personId])
      } else {
        await addSeriesInvitations(targetId, clubId, [personId])
      }
      // Refresh invitations
      const response = type === 'event'
        ? await getEventInvitations(targetId, clubId)
        : await getSeriesInvitations(targetId, clubId)
      setPersonInvitations(response.invitations.persons)
      setGroupInvitations(response.invitations.groups)
    } catch (err) {
      console.error('Failed to add invitation:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleAddGroup = async (groupId: string) => {
    setSaving(true)
    try {
      if (type === 'event') {
        await addEventInvitations(targetId, clubId, undefined, [groupId])
      } else {
        await addSeriesInvitations(targetId, clubId, undefined, [groupId])
      }
      // Refresh invitations
      const response = type === 'event'
        ? await getEventInvitations(targetId, clubId)
        : await getSeriesInvitations(targetId, clubId)
      setPersonInvitations(response.invitations.persons)
      setGroupInvitations(response.invitations.groups)
    } catch (err) {
      console.error('Failed to add group invitation:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (invitationId: string, personId?: string, groupId?: string, force?: boolean) => {
    setSaving(true)
    setWarningMessage(null)
    try {
      const result = type === 'event'
        ? await removeEventInvitation(targetId, clubId, { invitation_id: invitationId, person_id: personId, group_id: groupId }, force)
        : await removeSeriesInvitation(targetId, clubId, { invitation_id: invitationId, person_id: personId, group_id: groupId }, force)

      if (!result.success && result.warning) {
        setWarningMessage(result.warning)
        setPendingRemoval({ type: personId ? 'person' : 'group', id: invitationId, personId, groupId })
        return
      }

      // Refresh invitations
      const response = type === 'event'
        ? await getEventInvitations(targetId, clubId)
        : await getSeriesInvitations(targetId, clubId)
      setPersonInvitations(response.invitations.persons)
      setGroupInvitations(response.invitations.groups)
      setPendingRemoval(null)
    } catch (err) {
      console.error('Failed to remove invitation:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleForceRemove = async () => {
    if (!pendingRemoval) return
    await handleRemove(pendingRemoval.id, pendingRemoval.personId, pendingRemoval.groupId, true)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Manage Invites: {title}</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.loadingSmall}>
              <Spinner size="sm" />
              <span>Loading invitations...</span>
            </div>
          ) : (
            <>
              {/* Warning dialog */}
              {warningMessage && (
                <div className={styles.warningBox}>
                  <p>{warningMessage}</p>
                  <div className={styles.warningActions}>
                    <button
                      className={styles.btnSecondary}
                      onClick={() => {
                        setWarningMessage(null)
                        setPendingRemoval(null)
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className={styles.btnDanger}
                      onClick={handleForceRemove}
                      disabled={saving}
                    >
                      Remove Anyway
                    </button>
                  </div>
                </div>
              )}

              {/* Current group invitations */}
              <div className={styles.inviteSection}>
                <h4 className={styles.inviteSectionTitle}>
                  Invited Groups ({groupInvitations.length})
                </h4>
                {groupInvitations.length === 0 ? (
                  <p className={styles.emptyText}>No groups invited</p>
                ) : (
                  <div className={styles.inviteList}>
                    {groupInvitations.map((inv) => (
                      <div key={inv.id} className={styles.inviteItem}>
                        <div>
                          <div className={styles.inviteName}>{inv.name}</div>
                          <div className={styles.inviteMeta}>
                            {inv.kind} - {inv.member_count} members
                          </div>
                        </div>
                        <button
                          className={styles.btnRemove}
                          onClick={() => handleRemove(inv.id, undefined, inv.group_id)}
                          disabled={saving}
                          title="Remove group"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Current person invitations */}
              <div className={styles.inviteSection}>
                <h4 className={styles.inviteSectionTitle}>
                  Invited Members ({personInvitations.length})
                </h4>
                {personInvitations.length === 0 ? (
                  <p className={styles.emptyText}>No individual members invited</p>
                ) : (
                  <div className={styles.inviteList}>
                    {personInvitations.map((inv) => (
                      <div key={inv.id} className={styles.inviteItem}>
                        <div>
                          <div className={styles.inviteName}>{inv.name}</div>
                          <div className={styles.inviteMeta}>
                            {inv.email}
                            {inv.rsvp_response && (
                              <span className={styles.rsvpBadge}>
                                RSVP: {inv.rsvp_response}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className={styles.btnRemove}
                          onClick={() => handleRemove(inv.id, inv.person_id)}
                          disabled={saving}
                          title="Remove member"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add groups */}
              <div className={styles.inviteSection}>
                <h4 className={styles.inviteSectionTitle}>Add Groups</h4>
                {availableGroups.length === 0 ? (
                  <p className={styles.emptyText}>All groups invited</p>
                ) : (
                  <div className={styles.inviteList}>
                    {availableGroups.map((group) => (
                      <div key={group.id} className={styles.inviteItem}>
                        <div>
                          <div className={styles.inviteName}>{group.name}</div>
                          <div className={styles.inviteMeta}>
                            {group.kind} - {group.member_count} members
                          </div>
                        </div>
                        <button
                          className={styles.btnAdd}
                          onClick={() => handleAddGroup(group.id)}
                          disabled={saving}
                          title="Add group"
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add members */}
              <div className={styles.inviteSection}>
                <h4 className={styles.inviteSectionTitle}>Add Individual Members</h4>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Search members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className={styles.inviteList}>
                  {filteredMembers.slice(0, 10).map((member) => (
                    <div key={member.person_id} className={styles.inviteItem}>
                      <div>
                        <div className={styles.inviteName}>{member.name}</div>
                        <div className={styles.inviteMeta}>{member.email}</div>
                      </div>
                      <button
                        className={styles.btnAdd}
                        onClick={() => handleAddPerson(member.person_id)}
                        disabled={saving}
                        title="Add member"
                      >
                        +
                      </button>
                    </div>
                  ))}
                  {filteredMembers.length > 10 && (
                    <p className={styles.moreText}>
                      +{filteredMembers.length - 10} more (search to filter)
                    </p>
                  )}
                  {filteredMembers.length === 0 && (
                    <p className={styles.emptyText}>No available members</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.modalFooterSticky}>
          <button className={styles.btnPrimary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ADD ATTENDEE MODAL
// ============================================================================

function AddAttendeeModal({
  event,
  allMembers,
  onClose,
  onSuccess,
}: {
  event: AdminEvent
  allMembers: AdminMember[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [freeSession, setFreeSession] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredMembers = search
    ? allMembers.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.email.toLowerCase().includes(search.toLowerCase())
      )
    : allMembers

  const selectedMember = allMembers.find((m) => m.person_id === selectedPersonId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPersonId) {
      setError('Please select a member')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await adminCreateRsvp(event.id, {
        person_id: selectedPersonId,
        response: 'yes',
        free_session: freeSession,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add attendee')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Add Attendee</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <p className={styles.modalSubtext}>
              Add a member as attending <strong>{event.title}</strong> on{' '}
              {formatDateCompact(event.starts_at_utc)}
            </p>

            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Search member</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {selectedMember ? (
              <div className={styles.selectedMember}>
                <div>
                  <strong>{selectedMember.name}</strong>
                  <div className={styles.inviteMeta}>{selectedMember.email}</div>
                </div>
                <button
                  type="button"
                  className={styles.btnRemove}
                  onClick={() => setSelectedPersonId(null)}
                >
                  &times;
                </button>
              </div>
            ) : (
              <div className={styles.memberSelectList}>
                {filteredMembers.slice(0, 8).map((member) => (
                  <div
                    key={member.person_id}
                    className={styles.memberSelectItem}
                    onClick={() => setSelectedPersonId(member.person_id)}
                  >
                    <div className={styles.inviteName}>{member.name}</div>
                    <div className={styles.inviteMeta}>{member.email}</div>
                  </div>
                ))}
                {filteredMembers.length > 8 && (
                  <p className={styles.moreText}>
                    +{filteredMembers.length - 8} more (search to filter)
                  </p>
                )}
                {filteredMembers.length === 0 && (
                  <p className={styles.emptyText}>No members found</p>
                )}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={freeSession}
                  onChange={(e) => setFreeSession(e.target.checked)}
                />
                Free session (don&apos;t use subscription slot)
              </label>
              <p className={styles.formHint}>
                Check this to mark attendance without charging their subscription.
              </p>
            </div>
          </div>

          <div className={styles.modalFooterSticky}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving || !selectedPersonId}
            >
              {saving ? <Spinner size="sm" /> : 'Add as Attending'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN ADMIN EVENTS PAGE
// ============================================================================

export function AdminEvents() {
  const { memberships, loading: profileLoading } = useProfile()
  const clubId = memberships.length > 0 ? memberships[0].club_id : ''
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab state from URL (default: 'club')
  const activeTab = (searchParams.get('tab') as EventTab) || 'club'
  const setActiveTab = (tab: EventTab) => {
    setSearchParams({ tab })
  }

  const {
    events,
    eventsLoading,
    eventsError,
    series,
    seriesLoading,
    saving,
    createEvent,
    updateEvent,
    cancelEvent,
    createSeries,
    updateSeries,
    deleteSeries,
    generateEvents,
    refreshEvents,
  } = useAdminEvents({ clubId })

  const { groups } = useAdminGroups({ clubId })
  const { members } = useAdminMembers({ clubId })

  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null)
  const [loadingEventDetails, setLoadingEventDetails] = useState(false)
  const [copyingEvent, setCopyingEvent] = useState<AdminEvent | null>(null)
  const [showSeriesModal, setShowSeriesModal] = useState(false)
  const [editingSeries, setEditingSeries] = useState<EventSeries | null>(null)
  const [generatingSeriesId, setGeneratingSeriesId] = useState<string | null>(null)
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [managingInvitesEvent, setManagingInvitesEvent] = useState<AdminEvent | null>(null)
  const [managingInvitesSeries, setManagingInvitesSeries] = useState<EventSeries | null>(null)
  const [addingAttendeeEvent, setAddingAttendeeEvent] = useState<AdminEvent | null>(null)
  const [filter, setFilter] = useState<EventFilter>('all')

  // UK Events (external events) state
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([])
  const [externalEventsLoading, setExternalEventsLoading] = useState(false)
  const [externalEventsError, setExternalEventsError] = useState<string | null>(null)
  const [processingExternalId, setProcessingExternalId] = useState<string | null>(null)

  // Manual Events state
  const [manualEvents, setManualEvents] = useState<ExternalEvent[]>([])
  const [manualEventsLoading, setManualEventsLoading] = useState(false)
  const [manualEventsError, setManualEventsError] = useState<string | null>(null)
  const [showManualEventModal, setShowManualEventModal] = useState(false)
  const [editingManualEvent, setEditingManualEvent] = useState<ExternalEvent | null>(null)
  const [savingManualEvent, setSavingManualEvent] = useState(false)

  // Fetch UK external events
  const fetchExternalEvents = useCallback(async () => {
    if (!clubId) return
    setExternalEventsLoading(true)
    setExternalEventsError(null)
    try {
      const response = await getExternalEvents({ club_id: clubId, kind: 'uk', limit: 50 })
      setExternalEvents(response.external_events)
    } catch (err) {
      setExternalEventsError(err instanceof Error ? err.message : 'Failed to load UK events')
    } finally {
      setExternalEventsLoading(false)
    }
  }, [clubId])

  // Fetch manual external events
  const fetchManualEvents = useCallback(async () => {
    if (!clubId) return
    setManualEventsLoading(true)
    setManualEventsError(null)
    try {
      const response = await getExternalEvents({ club_id: clubId, kind: 'manual', limit: 50 })
      setManualEvents(response.external_events)
    } catch (err) {
      setManualEventsError(err instanceof Error ? err.message : 'Failed to load manual events')
    } finally {
      setManualEventsLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    if (activeTab === 'uk' && clubId) {
      fetchExternalEvents()
    }
  }, [activeTab, clubId, fetchExternalEvents])

  useEffect(() => {
    if (activeTab === 'manual' && clubId) {
      fetchManualEvents()
    }
  }, [activeTab, clubId, fetchManualEvents])

  // UK Events handlers
  const handlePromoteEvent = async (externalEvent: ExternalEvent) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(externalEvent.id)
    try {
      await promoteExternalEvent(externalEvent.id, { club_id: clubId })
      await fetchExternalEvents()
      refreshEvents()
    } catch (err) {
      console.error('Failed to promote event:', err)
      alert(err instanceof Error ? err.message : 'Failed to promote event')
    } finally {
      setProcessingExternalId(null)
    }
  }

  const handleIgnoreEvent = async (externalEventId: string) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(externalEventId)
    try {
      await ignoreExternalEvent(externalEventId, clubId)
      await fetchExternalEvents()
    } catch (err) {
      console.error('Failed to ignore event:', err)
      alert(err instanceof Error ? err.message : 'Failed to ignore event')
    } finally {
      setProcessingExternalId(null)
    }
  }

  const handleUndoDecision = async (externalEventId: string) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(externalEventId)
    try {
      await undoExternalEventDecision(externalEventId, clubId)
      await fetchExternalEvents()
      refreshEvents()
    } catch (err) {
      console.error('Failed to undo decision:', err)
      alert(err instanceof Error ? err.message : 'Failed to undo decision')
    } finally {
      setProcessingExternalId(null)
    }
  }

  // Manual Events handlers
  const handleCreateManualEvent = async (data: {
    title: string
    description?: string | null
    location?: string | null
    url?: string | null
    source?: string
    starts_at_utc: string
    ends_at_utc?: string | null
    status?: ExternalEventStatus
    visibility?: ExternalEventVisibility
  }) => {
    if (!clubId) return
    setSavingManualEvent(true)
    try {
      await createManualExternalEvent({ club_id: clubId, ...data })
      setShowManualEventModal(false)
      await fetchManualEvents()
    } catch (err) {
      console.error('Failed to create manual event:', err)
      alert(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setSavingManualEvent(false)
    }
  }

  const handleUpdateManualEvent = async (data: {
    title: string
    description?: string | null
    location?: string | null
    url?: string | null
    source?: string
    starts_at_utc: string
    ends_at_utc?: string | null
    status?: ExternalEventStatus
    visibility?: ExternalEventVisibility
  }) => {
    if (!clubId || !editingManualEvent) return
    setSavingManualEvent(true)
    try {
      await updateManualExternalEvent(editingManualEvent.id, { club_id: clubId, ...data })
      setEditingManualEvent(null)
      await fetchManualEvents()
    } catch (err) {
      console.error('Failed to update manual event:', err)
      alert(err instanceof Error ? err.message : 'Failed to update event')
    } finally {
      setSavingManualEvent(false)
    }
  }

  const handleDeleteManualEvent = async (eventId: string) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(eventId)
    try {
      await deleteManualExternalEvent(eventId, clubId)
      await fetchManualEvents()
    } catch (err) {
      console.error('Failed to delete manual event:', err)
      alert(err instanceof Error ? err.message : 'Failed to delete event')
    } finally {
      setProcessingExternalId(null)
    }
  }

  // Manual events - promote/ignore/undo reuse same handlers but need to refresh manual list
  const handlePromoteManualEvent = async (externalEvent: ExternalEvent) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(externalEvent.id)
    try {
      await promoteExternalEvent(externalEvent.id, { club_id: clubId })
      await fetchManualEvents()
      refreshEvents()
    } catch (err) {
      console.error('Failed to promote event:', err)
      alert(err instanceof Error ? err.message : 'Failed to promote event')
    } finally {
      setProcessingExternalId(null)
    }
  }

  const handleIgnoreManualEvent = async (externalEventId: string) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(externalEventId)
    try {
      await ignoreExternalEvent(externalEventId, clubId)
      await fetchManualEvents()
    } catch (err) {
      console.error('Failed to ignore event:', err)
      alert(err instanceof Error ? err.message : 'Failed to ignore event')
    } finally {
      setProcessingExternalId(null)
    }
  }

  const handleUndoManualDecision = async (externalEventId: string) => {
    if (!clubId || processingExternalId) return
    setProcessingExternalId(externalEventId)
    try {
      await undoExternalEventDecision(externalEventId, clubId)
      await fetchManualEvents()
      refreshEvents()
    } catch (err) {
      console.error('Failed to undo decision:', err)
      alert(err instanceof Error ? err.message : 'Failed to undo decision')
    } finally {
      setProcessingExternalId(null)
    }
  }

  // Split events into upcoming and past, then filter
  const allUpcomingEvents = events.filter((e) => !isPastEvent(e))
  const allPastEvents = events.filter((e) => isPastEvent(e))

  const upcomingEvents = allUpcomingEvents.filter((e) => eventMatchesFilter(e, filter))
  const pastEvents = allPastEvents.filter((e) => eventMatchesFilter(e, filter))

  const handleCreateEvent = async (data: Parameters<typeof createEvent>[0]) => {
    try {
      await createEvent(data)
      setShowEventModal(false)
      setCopyingEvent(null)
    } catch (err) {
      console.error('Failed to create event:', err)
    }
  }

  const handleCopyEvent = (event: AdminEvent) => {
    setCopyingEvent(event)
    setShowEventModal(true)
  }

  const handleEditEvent = async (event: AdminEvent) => {
    // Fetch full event details including pricing tiers
    setLoadingEventDetails(true)
    try {
      const response = await getAdminEventDetail(event.id, clubId)
      // Merge pricing tiers into the event
      const eventWithTiers: AdminEvent = {
        ...event,
        pricing_tiers: response.pricing_tiers,
      }
      setEditingEvent(eventWithTiers)
    } catch (err) {
      console.error('Failed to fetch event details:', err)
      // Fall back to editing without pricing tiers
      setEditingEvent(event)
    } finally {
      setLoadingEventDetails(false)
    }
  }

  const handleUpdateEvent = async (data: Parameters<typeof updateEvent>[1]) => {
    if (!editingEvent) return
    try {
      await updateEvent(editingEvent.id, data)
      setEditingEvent(null)
    } catch (err) {
      console.error('Failed to update event:', err)
    }
  }

  const handleCancelEvent = async (eventId: string) => {
    try {
      await cancelEvent(eventId)
    } catch (err) {
      console.error('Failed to cancel event:', err)
    }
  }

  const handleCreateSeries = async (data: Parameters<typeof createSeries>[0]) => {
    try {
      const result = await createSeries(data)
      setShowSeriesModal(false)
      alert(`Series created with ${result.eventsCreated} events generated!`)
    } catch (err) {
      console.error('Failed to create series:', err)
    }
  }

  const handleUpdateSeries = async (data: Parameters<typeof updateSeries>[1]) => {
    if (!editingSeries) return
    try {
      await updateSeries(editingSeries.id, data)
      setEditingSeries(null)
    } catch (err) {
      console.error('Failed to update series:', err)
    }
  }

  const handleDeleteSeries = async (seriesId: string) => {
    try {
      await deleteSeries(seriesId)
      setEditingSeries(null)
    } catch (err) {
      console.error('Failed to delete series:', err)
    }
  }

  const handleGenerateEvents = async (seriesId: string) => {
    setGeneratingSeriesId(seriesId)
    try {
      const count = await generateEvents(seriesId, 8)
      alert(`Generated ${count} new events!`)
    } catch (err) {
      console.error('Failed to generate events:', err)
    } finally {
      setGeneratingSeriesId(null)
    }
  }

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
  if (eventsError) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link to="/app/admin" className={styles.backLink}>
            &larr; Back to Admin
          </Link>
          <h1 className={styles.title}>Events</h1>
        </div>
        <div className={styles.error}>
          <div className={styles.errorIcon}>!</div>
          <h2>Unable to load events</h2>
          <p>{eventsError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerCompact}>
        <Link to="/app/admin" className={styles.backLink}>
          &larr; Back to Admin
        </Link>
        <h1 className={styles.title}>Events</h1>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'club' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('club')}
        >
          Club Events
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'uk' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('uk')}
        >
          UK Events
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'manual' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          Manual / Coach
        </button>
      </div>

      {/* UK Events Tab Content */}
      {activeTab === 'uk' && (
        <div className={styles.ukEventsSection}>
          <div className={styles.boaNotice}>
            <span className={styles.boaNoticeIcon}>i</span>
            <span>UK events are synced monthly from the <strong>British Octopush Association</strong>, with whom West Wickham Underwater Hockey Club is affiliated. Promote events to add them to your club calendar.</span>
          </div>
          {externalEventsLoading ? (
            <div className={styles.loading}>
              <Spinner />
              <p>Loading UK events...</p>
            </div>
          ) : externalEventsError ? (
            <div className={styles.error}>
              <div className={styles.errorIcon}>!</div>
              <p>{externalEventsError}</p>
              <button className={styles.btnSecondary} onClick={fetchExternalEvents}>
                Try Again
              </button>
            </div>
          ) : externalEvents.length === 0 ? (
            <div className={styles.empty}>
              <p>No upcoming UK events found</p>
            </div>
          ) : (
            <div className={styles.ukEventsList}>
              {externalEvents.map((extEvent) => (
                <ExternalEventCard
                  key={extEvent.id}
                  event={extEvent}
                  onPromote={() => handlePromoteEvent(extEvent)}
                  onIgnore={() => handleIgnoreEvent(extEvent.id)}
                  onUndo={() => handleUndoDecision(extEvent.id)}
                  processing={processingExternalId === extEvent.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Events Tab Content */}
      {activeTab === 'manual' && (
        <div className={styles.ukEventsSection}>
          {/* Actions */}
          <div className={styles.actionsCompact}>
            <button className={styles.btnPrimary} onClick={() => setShowManualEventModal(true)}>
              + Add External Event
            </button>
          </div>

          {manualEventsLoading ? (
            <div className={styles.loading}>
              <Spinner />
              <p>Loading manual events...</p>
            </div>
          ) : manualEventsError ? (
            <div className={styles.error}>
              <div className={styles.errorIcon}>!</div>
              <p>{manualEventsError}</p>
              <button className={styles.btnSecondary} onClick={fetchManualEvents}>
                Try Again
              </button>
            </div>
          ) : manualEvents.length === 0 ? (
            <div className={styles.empty}>
              <p>No manual events yet</p>
              <p className={styles.subtitle}>Add external events like international competitions or coach-specific events</p>
            </div>
          ) : (
            <div className={styles.ukEventsList}>
              {manualEvents.map((extEvent) => (
                <ManualEventCard
                  key={extEvent.id}
                  event={extEvent}
                  onEdit={() => setEditingManualEvent(extEvent)}
                  onPromote={() => handlePromoteManualEvent(extEvent)}
                  onIgnore={() => handleIgnoreManualEvent(extEvent.id)}
                  onUndo={() => handleUndoManualDecision(extEvent.id)}
                  onDelete={() => handleDeleteManualEvent(extEvent.id)}
                  processing={processingExternalId === extEvent.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Event Modal */}
      {(showManualEventModal || editingManualEvent) && (
        <ManualEventModal
          event={editingManualEvent}
          onSave={editingManualEvent ? handleUpdateManualEvent : handleCreateManualEvent}
          onClose={() => {
            setShowManualEventModal(false)
            setEditingManualEvent(null)
          }}
          saving={savingManualEvent}
        />
      )}

      {/* Club Events Tab Content */}
      {activeTab === 'club' && (
        <>
          {/* Actions - Create buttons */}
          <div className={styles.actionsCompact}>
            <button className={styles.btnPrimary} onClick={() => setShowEventModal(true)}>
              + Create Event
            </button>
            <button className={styles.btnSecondary} onClick={() => setShowSeriesModal(true)}>
              + Create Series
            </button>
          </div>

          {/* Recurring Series */}
          {!seriesLoading && series.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Recurring Series</h2>
              <div className={styles.seriesList}>
                {series.map((s) => (
                  <SeriesCard
                    key={s.id}
                    series={s}
                    onEdit={() => setEditingSeries(s)}
                    onGenerate={() => handleGenerateEvents(s.id)}
                    onManageInvites={() => setManagingInvitesSeries(s)}
                    onDelete={() => handleDeleteSeries(s.id)}
                    generating={generatingSeriesId === s.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Events */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Upcoming Events</h2>

            {/* Filter bar */}
            <FilterBar selected={filter} onChange={setFilter} />

            {upcomingEvents.length === 0 ? (
              <div className={styles.empty}>
                <p>{filter === 'all' ? 'No upcoming events' : `No upcoming ${filter} events`}</p>
              </div>
            ) : (
              <div className={styles.eventsList}>
                {upcomingEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEdit={() => handleEditEvent(event)}
                    onCancel={() => handleCancelEvent(event.id)}
                    onCopy={() => handleCopyEvent(event)}
                    onManageInvites={() => setManagingInvitesEvent(event)}
                    onAddAttendee={() => setAddingAttendeeEvent(event)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Past Events */}
          {allPastEvents.length > 0 && (
            <section className={styles.section}>
              <button
                className={styles.togglePast}
                onClick={() => setShowPastEvents(!showPastEvents)}
              >
                {showPastEvents ? '− Hide' : '+ Show'} previous events ({pastEvents.length})
              </button>
              {showPastEvents && (
                <div className={styles.eventsList}>
                  {pastEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      onEdit={() => handleEditEvent(event)}
                      onCancel={() => handleCancelEvent(event.id)}
                      onCopy={() => handleCopyEvent(event)}
                      onManageInvites={() => setManagingInvitesEvent(event)}
                      onAddAttendee={() => setAddingAttendeeEvent(event)}
                      isPast
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Create Event Modal (or Copy Event) */}
      {showEventModal && (
        <EventModal
          event={null}
          copyFrom={copyingEvent}
          onSave={handleCreateEvent}
          onClose={() => {
            setShowEventModal(false)
            setCopyingEvent(null)
          }}
          saving={saving}
        />
      )}

      {/* Loading Event Details */}
      {loadingEventDetails && (
        <div className={styles.modalOverlay}>
          <div className={styles.loading}>
            <Spinner size="lg" />
            <p>Loading event details...</p>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editingEvent && !loadingEventDetails && (
        <EventModal
          event={editingEvent}
          onSave={handleUpdateEvent}
          onClose={() => setEditingEvent(null)}
          saving={saving}
        />
      )}

      {/* Create Series Modal */}
      {showSeriesModal && (
        <SeriesModal
          series={null}
          onSave={handleCreateSeries}
          onClose={() => setShowSeriesModal(false)}
          saving={saving}
        />
      )}

      {/* Edit Series Modal */}
      {editingSeries && (
        <SeriesModal
          series={editingSeries}
          onSave={handleUpdateSeries}
          onClose={() => setEditingSeries(null)}
          onDelete={() => handleDeleteSeries(editingSeries.id)}
          saving={saving}
        />
      )}

      {/* Event Invitations Modal */}
      {managingInvitesEvent && (
        <InvitationModal
          title={managingInvitesEvent.title}
          type="event"
          targetId={managingInvitesEvent.id}
          clubId={clubId}
          allMembers={members}
          allGroups={groups}
          onClose={() => setManagingInvitesEvent(null)}
        />
      )}

      {/* Series Invitations Modal */}
      {managingInvitesSeries && (
        <InvitationModal
          title={managingInvitesSeries.title}
          type="series"
          targetId={managingInvitesSeries.id}
          clubId={clubId}
          allMembers={members}
          allGroups={groups}
          onClose={() => setManagingInvitesSeries(null)}
        />
      )}

      {/* Add Attendee Modal */}
      {addingAttendeeEvent && (
        <AddAttendeeModal
          event={addingAttendeeEvent}
          allMembers={members}
          onClose={() => setAddingAttendeeEvent(null)}
          onSuccess={() => {
            setAddingAttendeeEvent(null)
            refreshEvents()
          }}
        />
      )}
    </div>
  )
}

