/**
 * AdminEvents Page
 *
 * Manage events and recurring series.
 */

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { useAdminEvents } from '@/hooks/useAdminEvents'
import { useAdminGroups } from '@/hooks/useAdminGroups'
import { useAdminMembers } from '@/hooks/useAdminMembers'
import { Spinner } from '@/components'
import type { AdminEvent, EventSeries, AdminGroup, AdminMember } from '@/lib/api'
import type { EventKind } from '@/types/database'
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
} from '@/lib/api'
import styles from './AdminEvents.module.css'

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
}

interface SeriesDraft {
  title: string
  description: string
  location: string
  weekdays: number[]
  startTime: string
  duration: number
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
  }) => void
  onClose: () => void
  saving: boolean
}) {
  const isEdit = !!event
  const isCopy = !!copyFrom
  const sourceEvent = event || copyFrom

  // Parse existing event data or use defaults
  const defaultStart = new Date()
  defaultStart.setHours(21, 0, 0, 0)
  defaultStart.setDate(defaultStart.getDate() + 7)

  const defaultEnd = new Date(defaultStart)
  defaultEnd.setMinutes(defaultEnd.getMinutes() + 90)

  const defaultVisible = new Date(defaultStart)
  defaultVisible.setDate(defaultVisible.getDate() - 5)

  // Load saved draft for new events (not edit or copy)
  const savedDraft = (!isEdit && !isCopy) ? (() => {
    try {
      const stored = localStorage.getItem(EVENT_DRAFT_KEY)
      return stored ? JSON.parse(stored) as EventDraft : null
    } catch {
      return null
    }
  })() : null

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
      // Default to next week same time
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
    return '22:00' // Default 1 hour after 21:00
  })
  const [isAllDay, setIsAllDay] = useState(() => {
    if (sourceEvent) {
      // Check if it's an all-day event (spans midnight or multiple days)
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
    // Default to same as start date
    return ''
  })
  const [paymentMode, setPaymentMode] = useState<'included' | 'one_off' | 'free'>(
    sourceEvent?.payment_mode || savedDraft?.paymentMode || 'included'
  )
  const [feeCents, setFeeCents] = useState(sourceEvent?.fee_cents || savedDraft?.feeCents || 0)
  const [visibilityDays, setVisibilityDays] = useState(savedDraft?.visibilityDays || 5)

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
    }
  }, [title, description, location, kind, startDate, startTime, endTime, isAllDay, endDate, paymentMode, feeCents, visibilityDays])

  // Save draft to localStorage when values change (only for new events)
  useEffect(() => {
    if (isEdit || isCopy) return
    localStorage.setItem(EVENT_DRAFT_KEY, JSON.stringify(draftRef.current))
  }, [isEdit, isCopy, title, description, location, kind, startDate, startTime, endTime, isAllDay, endDate, paymentMode, feeCents, visibilityDays])

  // Save draft on unmount (catches navigation away)
  useEffect(() => {
    return () => {
      if (!isEdit && !isCopy) {
        localStorage.setItem(EVENT_DRAFT_KEY, JSON.stringify(draftRef.current))
      }
    }
  }, [isEdit, isCopy])

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
      // All-day event: start at midnight, end at end of end date
      startsAt = new Date(`${startDate}T00:00:00`)
      endsAt = new Date(`${endDate}T23:59:59`)
    } else {
      // Regular event with start and end time
      startsAt = new Date(`${startDate}T${startTime}:00`)
      endsAt = new Date(`${startDate}T${endTime}:00`)
      // If end time is before start time, assume it's the next day
      if (endsAt <= startsAt) {
        endsAt.setDate(endsAt.getDate() + 1)
      }
    }

    const visibleFrom = new Date(startsAt.getTime() - visibilityDays * 24 * 60 * 60 * 1000)

    // Clear draft before saving (will be removed on success)
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
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{isEdit ? 'Edit Event' : isCopy ? 'Copy Event' : 'Create Event'}</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
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

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => {
                    setIsAllDay(e.target.checked)
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
                  <label className={styles.formLabel}>Start Time</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>End Time</label>
                  <input
                    type="time"
                    className={styles.formInput}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Location</label>
              <input
                type="text"
                className={styles.formInput}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. West Wickham Leisure Centre"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type</label>
                <select
                  className={styles.formInput}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as EventKind)}
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
                <label className={styles.formLabel}>Visibility (days before)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={visibilityDays}
                  onChange={(e) => setVisibilityDays(parseInt(e.target.value) || 5)}
                  min={0}
                  max={90}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Payment</label>
                <select
                  className={styles.formInput}
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as typeof paymentMode)}
                >
                  <option value="included">Included in subscription</option>
                  <option value="one_off">One-off payment</option>
                  <option value="free">Free</option>
                </select>
              </div>
              {paymentMode === 'one_off' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Fee (pence)</label>
                  <input
                    type="number"
                    className={styles.formInput}
                    value={feeCents}
                    onChange={(e) => setFeeCents(parseInt(e.target.value) || 0)}
                    min={0}
                  />
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                className={styles.formTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </div>

          <div className={styles.modalFooterSticky}>
            {!isEdit && !isCopy && savedDraft && (
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

  // Load saved draft for new series (not edit)
  const savedDraft = !isEdit ? (() => {
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
  const [duration, setDuration] = useState(series?.duration_min || savedDraft?.duration || 90)
  const [startDate, setStartDate] = useState(
    series?.start_date || savedDraft?.startDate || new Date().toISOString().slice(0, 10)
  )
  const [hasEndDate, setHasEndDate] = useState(series?.end_date ? true : savedDraft?.hasEndDate || false)
  const [endDate, setEndDate] = useState(series?.end_date || savedDraft?.endDate || '')
  const [visibilityDays, setVisibilityDays] = useState(series?.visibility_days ?? savedDraft?.visibilityDays ?? 5)
  const feeCents = series?.default_fee_cents || 0
  const [generateWeeks, setGenerateWeeks] = useState(savedDraft?.generateWeeks || 8)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Keep a ref to current values for saving on unmount
  const draftRef = useRef<SeriesDraft>({
    title,
    description,
    location,
    weekdays,
    startTime,
    duration,
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
      duration,
      startDate,
      hasEndDate,
      endDate,
      visibilityDays,
      generateWeeks,
    }
  }, [title, description, location, weekdays, startTime, duration, startDate, hasEndDate, endDate, visibilityDays, generateWeeks])

  // Save draft to localStorage when values change (only for new series)
  useEffect(() => {
    if (isEdit) return
    localStorage.setItem(SERIES_DRAFT_KEY, JSON.stringify(draftRef.current))
  }, [isEdit, title, description, location, weekdays, startTime, duration, startDate, hasEndDate, endDate, visibilityDays, generateWeeks])

  // Save draft on unmount (catches navigation away)
  useEffect(() => {
    return () => {
      if (!isEdit) {
        localStorage.setItem(SERIES_DRAFT_KEY, JSON.stringify(draftRef.current))
      }
    }
  }, [isEdit])

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
    setDuration(90)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || weekdays.length === 0 || !startTime || !startDate) return

    // Calculate weekday mask
    const weekdayMask = weekdays.reduce((mask, day) => mask | (1 << day), 0)

    // Clear draft before saving
    clearDraft()

    onSave({
      title,
      description: description || undefined,
      location: location || undefined,
      weekday_mask: weekdayMask,
      start_time_local: startTime,
      duration_min: duration,
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
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
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
                <label className={styles.formLabel}>Start Time</label>
                <input
                  type="time"
                  className={styles.formInput}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Duration (min)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 90)}
                  min={15}
                  max={480}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Visibility (days)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={visibilityDays}
                  onChange={(e) => setVisibilityDays(parseInt(e.target.value) || 5)}
                  min={0}
                  max={30}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Location</label>
              <input
                type="text"
                className={styles.formInput}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. West Wickham Leisure Centre"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Start Date</label>
                <input
                  type="date"
                  className={styles.formInput}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <input
                    type="checkbox"
                    checked={hasEndDate}
                    onChange={(e) => setHasEndDate(e.target.checked)}
                  />{' '}
                  Has End Date
                </label>
                {hasEndDate && (
                  <input
                    type="date"
                    className={styles.formInput}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                )}
              </div>
            </div>

            {!isEdit && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Generate events for next (weeks)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={generateWeeks}
                  onChange={(e) => setGenerateWeeks(parseInt(e.target.value) || 8)}
                  min={1}
                  max={52}
                />
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                className={styles.formTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>

            {/* Danger zone for edit mode */}
            {isEdit && onDelete && (
              <div className={styles.dangerZone}>
                <h4 className={styles.dangerZoneTitle}>Danger Zone</h4>
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

          <div className={styles.modalFooterSticky}>
            {!isEdit && savedDraft && (
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
  const [copyingEvent, setCopyingEvent] = useState<AdminEvent | null>(null)
  const [showSeriesModal, setShowSeriesModal] = useState(false)
  const [editingSeries, setEditingSeries] = useState<EventSeries | null>(null)
  const [generatingSeriesId, setGeneratingSeriesId] = useState<string | null>(null)
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [managingInvitesEvent, setManagingInvitesEvent] = useState<AdminEvent | null>(null)
  const [managingInvitesSeries, setManagingInvitesSeries] = useState<EventSeries | null>(null)
  const [addingAttendeeEvent, setAddingAttendeeEvent] = useState<AdminEvent | null>(null)
  const [filter, setFilter] = useState<EventFilter>('all')

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
                onEdit={() => setEditingEvent(event)}
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
                  onEdit={() => setEditingEvent(event)}
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

      {/* Edit Event Modal */}
      {editingEvent && (
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
