/**
 * EventTeams Page
 *
 * View and manage team assignments for an event.
 * - View mode: Shows teams as cards with players grouped by position
 * - Admin mode: Allows team/position/activity assignment via UI controls
 */

import { useState, useMemo, useRef, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { useProfile } from '@/hooks/useProfile'
import { usePermissions, PERMISSIONS } from '@/hooks/usePermissions'
import { useEventTeams } from '@/hooks/useEventTeams'
import { Spinner, TeamSheet, Avatar } from '@/components'
import type { TeamAssignment, AssignmentUpdate, AvailablePlayer } from '@/lib/api'
import styles from './EventTeams.module.css'

// Position display names and order
const POSITIONS = [
  { code: 'F', name: 'Forward' },
  { code: 'W', name: 'Wing' },
  { code: 'C', name: 'Centre' },
  { code: 'B', name: 'Back' },
] as const

const ACTIVITIES = [
  { value: 'play', label: 'Playing' },
  { value: 'swim_sets', label: 'Swim Sets' },
  { value: 'not_playing', label: 'Not Playing' },
  { value: 'other', label: 'Other' },
] as const

// Additional team options for larger groups
const ADDITIONAL_TEAMS = [
  { name: 'Reds - White', sort_order: 2 },
  { name: 'Reds - Black', sort_order: 3 },
  { name: 'Blues - White', sort_order: 4 },
  { name: 'Blues - Black', sort_order: 5 },
] as const

// Threshold for showing "add more teams" option
const LARGE_GROUP_THRESHOLD = 12

// Helper to format date
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Format name as "FirstName L." (first name + last initial)
function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const firstName = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || ''
  return `${firstName} ${lastInitial}.`
}

// Group assignments by position
function groupByPosition(assignments: TeamAssignment[]): Map<string, TeamAssignment[]> {
  const groups = new Map<string, TeamAssignment[]>()

  // Initialize with position order
  POSITIONS.forEach((pos) => groups.set(pos.code, []))
  groups.set('none', []) // For players without position

  assignments.forEach((a) => {
    const key = a.position_code || 'none'
    const group = groups.get(key) || []
    group.push(a)
    groups.set(key, group)
  })

  return groups
}

interface PlayerCardProps {
  assignment: TeamAssignment
  canAssignTeams: boolean
  onEdit: (assignment: TeamAssignment) => void
}

function PlayerCard({ assignment, canAssignTeams, onEdit }: PlayerCardProps) {
  const position = POSITIONS.find((p) => p.code === assignment.position_code)
  const isDropout = !!assignment.cancelled_late
  const isNoShow = assignment.attendance_status === 'absent' && !isDropout
  const isLate = assignment.attendance_status === 'late'

  return (
    <div
      className={`${styles.playerCard} ${canAssignTeams ? styles.playerCardEditable : ''} ${isDropout ? styles.playerCardDropout : ''} ${isNoShow ? styles.playerCardNoShow : ''} ${isLate ? styles.playerCardLate : ''}`}
      onClick={canAssignTeams ? () => onEdit(assignment) : undefined}
    >
      <Avatar
        src={assignment.person_photo_url}
        name={assignment.person_name}
        size="sm"
        className={styles.playerAvatar}
      />
      <div className={styles.playerInfo}>
        <div className={styles.playerName}>
          {formatShortName(assignment.person_name)}
          {isDropout && <span className={styles.dropoutBadge}>Dropped Out</span>}
          {isNoShow && <span className={styles.noShowBadge}>No Show</span>}
          {isLate && <span className={styles.lateBadge}>Late</span>}
        </div>
        {position && <div className={styles.playerPosition}>{position.name}</div>}
        {assignment.notes && <div className={styles.playerNotes}>{assignment.notes}</div>}
      </div>
    </div>
  )
}

interface TeamCardProps {
  name: string
  assignments: TeamAssignment[]
  color?: string
  canAssignTeams: boolean
  onEditPlayer: (assignment: TeamAssignment) => void
}

function TeamCard({ name, assignments, color, canAssignTeams, onEditPlayer }: TeamCardProps) {
  const grouped = useMemo(() => groupByPosition(assignments), [assignments])
  const playingCount = assignments.filter((a) => a.activity === 'play').length

  return (
    <div className={styles.teamCard} style={{ '--team-color': color } as React.CSSProperties}>
      <div className={styles.teamHeader}>
        <h3 className={styles.teamName}>{name}</h3>
        <span className={styles.teamCount}>{playingCount} players</span>
      </div>
      <div className={styles.teamPlayers}>
        {POSITIONS.map((pos) => {
          const posPlayers = grouped.get(pos.code) || []
          if (posPlayers.length === 0) return null
          return (
            <div key={pos.code} className={styles.positionGroup}>
              <div className={styles.positionLabel}>{pos.name}</div>
              <div className={styles.positionPlayers}>
                {posPlayers.map((a) => (
                  <PlayerCard
                    key={a.person_id}
                    assignment={a}
                    canAssignTeams={canAssignTeams}
                    onEdit={onEditPlayer}
                  />
                ))}
              </div>
            </div>
          )
        })}
        {/* Players without position */}
        {(() => {
          const noPos = grouped.get('none') || []
          if (noPos.length === 0) return null
          return (
            <div className={styles.positionGroup}>
              <div className={styles.positionLabel}>Unassigned Position</div>
              <div className={styles.positionPlayers}>
                {noPos.map((a) => (
                  <PlayerCard
                    key={a.person_id}
                    assignment={a}
                    canAssignTeams={canAssignTeams}
                    onEdit={onEditPlayer}
                  />
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

interface EditPlayerModalProps {
  assignment: TeamAssignment | null
  teams: Array<{ id: string; name: string }>
  onSave: (update: AssignmentUpdate) => void
  onClose: () => void
  saving: boolean
}

const ATTENDANCE_OPTIONS = [
  { value: null, label: 'Not Set' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'No Show' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
] as const

function EditPlayerModal({ assignment, teams, onSave, onClose, saving }: EditPlayerModalProps) {
  const [teamId, setTeamId] = useState<string | null>(assignment?.team_id || null)
  const [activity, setActivity] = useState<AssignmentUpdate['activity']>(
    assignment?.activity || 'play'
  )
  const [position, setPosition] = useState<AssignmentUpdate['position_code']>(
    assignment?.position_code || null
  )
  const [notes, setNotes] = useState(assignment?.notes || '')
  const [attendanceStatus, setAttendanceStatus] = useState<AssignmentUpdate['attendance_status']>(
    assignment?.attendance_status || null
  )

  if (!assignment) return null

  const handleSave = () => {
    onSave({
      person_id: assignment.person_id,
      team_id: teamId,
      activity,
      position_code: position,
      notes: notes || null,
      attendance_status: attendanceStatus,
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>{assignment.person_name}</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Team Selector */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Team</label>
            <div className={styles.segmentedControl}>
              <button
                className={`${styles.segmentBtn} ${teamId === null ? styles.segmentBtnActive : ''}`}
                onClick={() => setTeamId(null)}
              >
                None
              </button>
              {teams.map((team) => (
                <button
                  key={team.id}
                  className={`${styles.segmentBtn} ${teamId === team.id ? styles.segmentBtnActive : ''}`}
                  onClick={() => setTeamId(team.id)}
                >
                  {team.name}
                </button>
              ))}
            </div>
          </div>

          {/* Activity Selector */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Activity</label>
            <div className={styles.segmentedControl}>
              {ACTIVITIES.map((act) => (
                <button
                  key={act.value}
                  className={`${styles.segmentBtn} ${activity === act.value ? styles.segmentBtnActive : ''}`}
                  onClick={() => setActivity(act.value as AssignmentUpdate['activity'])}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          {/* Position Selector (only if playing) */}
          {activity === 'play' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Position</label>
              <div className={styles.segmentedControl}>
                <button
                  className={`${styles.segmentBtn} ${position === null ? styles.segmentBtnActive : ''}`}
                  onClick={() => setPosition(null)}
                >
                  None
                </button>
                {POSITIONS.map((pos) => (
                  <button
                    key={pos.code}
                    className={`${styles.segmentBtn} ${position === pos.code ? styles.segmentBtnActive : ''}`}
                    onClick={() => setPosition(pos.code as AssignmentUpdate['position_code'])}
                  >
                    {pos.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Notes</label>
            <input
              type="text"
              className={styles.formInput}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>

          {/* Attendance Status */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Attendance</label>
            <div className={styles.segmentedControl}>
              {ATTENDANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value ?? 'null'}
                  className={`${styles.segmentBtn} ${attendanceStatus === opt.value ? styles.segmentBtnActive : ''} ${opt.value === 'absent' && attendanceStatus === 'absent' ? styles.segmentBtnNoShow : ''}`}
                  onClick={() => setAttendanceStatus(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AddTeamsModalProps {
  existingTeams: string[]
  onAdd: (teamNames: string[]) => void
  onClose: () => void
  saving: boolean
}

function AddTeamsModal({ existingTeams, onAdd, onClose, saving }: AddTeamsModalProps) {
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])

  // Filter out teams that already exist
  const availableTeams = ADDITIONAL_TEAMS.filter(
    t => !existingTeams.some(et => et.toLowerCase() === t.name.toLowerCase())
  )

  const toggleTeam = (teamName: string) => {
    setSelectedTeams(prev =>
      prev.includes(teamName)
        ? prev.filter(t => t !== teamName)
        : [...prev, teamName]
    )
  }

  const handleAdd = () => {
    if (selectedTeams.length > 0) {
      onAdd(selectedTeams)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Add More Teams</h3>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.modalHint}>
            For larger groups, add additional teams. Select which teams to create:
          </p>

          <div className={styles.teamCheckboxes}>
            {availableTeams.map(team => (
              <label key={team.name} className={styles.teamCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.name)}
                  onChange={() => toggleTeam(team.name)}
                />
                <span className={styles.teamCheckboxLabel}>{team.name}</span>
              </label>
            ))}
          </div>

          {availableTeams.length === 0 && (
            <p className={styles.noTeamsText}>All additional teams have been created.</p>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleAdd}
            disabled={saving || selectedTeams.length === 0}
          >
            {saving ? <Spinner size="sm" /> : `Add ${selectedTeams.length} Team${selectedTeams.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AvailablePlayersProps {
  players: AvailablePlayer[]
  canAssignTeams: boolean
  onAssign: (player: AvailablePlayer) => void
}

function AvailablePlayers({ players, canAssignTeams, onAssign }: AvailablePlayersProps) {
  if (players.length === 0) return null

  return (
    <div className={styles.availableSection}>
      <h3 className={styles.sectionTitle}>Available Players ({players.length})</h3>
      <p className={styles.sectionSubtitle}>RSVP'd yes but not yet assigned</p>
      <div className={styles.availableList}>
        {players.map((p) => (
          <div
            key={p.person_id}
            className={`${styles.availablePlayer} ${canAssignTeams ? styles.availablePlayerClickable : ''}`}
            onClick={canAssignTeams ? () => onAssign(p) : undefined}
          >
            <Avatar
              src={p.person_photo_url}
              name={p.person_name}
              size="xs"
              className={styles.availableAvatar}
            />
            <span>{formatShortName(p.person_name)}</span>
            {canAssignTeams && <span className={styles.assignIcon}>+</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function EventTeams() {
  const { eventId } = useParams<{ eventId: string }>()
  const { memberships, loading: profileLoading } = useProfile()
  const { hasPermission } = usePermissions()
  const canAssignTeams = hasPermission(PERMISSIONS.TEAMS_ASSIGN)

  const clubId = memberships.length > 0 ? memberships[0].club_id : ''

  const {
    event,
    teams,
    unassigned,
    availablePlayers,
    totalRsvpYes,
    loading,
    error,
    saving,
    createTeams,
    updateAssignments,
  } = useEventTeams({ eventId: eventId || '', clubId })

  const [editingPlayer, setEditingPlayer] = useState<TeamAssignment | null>(null)
  const [showCreateTeams, setShowCreateTeams] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showAddTeamsModal, setShowAddTeamsModal] = useState(false)
  const [sharing, setSharing] = useState(false)
  const teamSheetRef = useRef<HTMLDivElement>(null)

  // Check if we should show the add teams option
  const canAddMoreTeams = canAssignTeams && teams.length >= 2 && teams.length < 4 && totalRsvpYes > LARGE_GROUP_THRESHOLD
  const showScheduleNote = teams.length >= 3

  // Handle saving player assignment
  const handleSaveAssignment = async (update: AssignmentUpdate) => {
    try {
      await updateAssignments([update])
      setEditingPlayer(null)
    } catch (err) {
      console.error('Failed to save assignment:', err)
    }
  }

  // Handle assigning available player
  const handleAssignAvailable = (player: AvailablePlayer) => {
    // Create a temporary assignment object to edit
    setEditingPlayer({
      event_id: eventId || '',
      person_id: player.person_id,
      team_id: null,
      activity: 'play',
      position_code: null,
      notes: null,
      assigned_at: new Date().toISOString(),
      person_name: player.person_name,
      person_email: player.person_email,
      person_photo_url: player.person_photo_url,
      attendance_status: null,
      cancelled_late: false,
    })
  }

  // Handle creating default teams
  const handleCreateDefaultTeams = async () => {
    try {
      await createTeams([
        { name: 'White', sort_order: 0 },
        { name: 'Black', sort_order: 1 },
      ])
      setShowCreateTeams(false)
    } catch (err) {
      console.error('Failed to create teams:', err)
    }
  }

  // Handle adding additional teams (for large groups)
  const handleAddTeams = async (teamNames: string[]) => {
    try {
      const newTeams = teamNames.map((name, idx) => {
        const template = ADDITIONAL_TEAMS.find(t => t.name === name)
        return {
          name,
          sort_order: template?.sort_order ?? (teams.length + idx),
        }
      })
      await createTeams(newTeams)
      setShowAddTeamsModal(false)
    } catch (err) {
      console.error('Failed to add teams:', err)
    }
  }

  // Format date for TeamSheet
  const formattedDate = event
    ? formatDate(event.starts_at_utc)
    : ''

  // Handle share as image
  const handleShareImage = useCallback(async () => {
    if (!teamSheetRef.current) return

    setSharing(true)
    try {
      const dataUrl = await toPng(teamSheetRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#0a1929',
      })

      // Check if Web Share API is available and supports files
      if (navigator.share && navigator.canShare) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], `teams-${eventId}.png`, { type: 'image/png' })

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: event?.title || 'Team Sheet',
            files: [file],
          })
        } else {
          // Fall back to download
          downloadImage(dataUrl)
        }
      } else {
        // Fall back to download
        downloadImage(dataUrl)
      }
    } catch (err) {
      console.error('Failed to share:', err)
      // User cancelled share or error occurred
    } finally {
      setSharing(false)
      setShowShareModal(false)
    }
  }, [event?.title, eventId])

  // Download image fallback
  const downloadImage = (dataUrl: string) => {
    const link = document.createElement('a')
    link.download = `teams-${eventId}.png`
    link.href = dataUrl
    link.click()
  }

  // Loading state
  if (profileLoading || loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Spinner size="lg" />
          <p>Loading teams...</p>
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
          <h2>Unable to load teams</h2>
          <p>{error}</p>
          <Link to="/app/events" className={styles.backLink}>
            Back to Events
          </Link>
        </div>
      </div>
    )
  }

  // No event data
  if (!event) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Event not found</h2>
          <Link to="/app/events" className={styles.backLink}>
            Back to Events
          </Link>
        </div>
      </div>
    )
  }

  // No teams yet (admin can create)
  if (teams.length === 0 && canAssignTeams) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link to="/app/events" className={styles.backLink}>
            &larr; Back to Events
          </Link>
          <h1 className={styles.title}>{event.title}</h1>
          <p className={styles.subtitle}>{formatDate(event.starts_at_utc)}</p>
        </div>

        <div className={styles.empty}>
          <h2>No teams created yet</h2>
          <p>Create teams to start assigning players.</p>
          {!showCreateTeams ? (
            <button className={styles.btnPrimary} onClick={() => setShowCreateTeams(true)}>
              Create Teams
            </button>
          ) : (
            <div className={styles.createTeamsBox}>
              <p>Create default White/Black teams?</p>
              <div className={styles.createTeamsBtns}>
                <button
                  className={styles.btnSecondary}
                  onClick={() => setShowCreateTeams(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={handleCreateDefaultTeams}
                  disabled={saving}
                >
                  {saving ? <Spinner size="sm" /> : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Available players even before teams created */}
        <AvailablePlayers
          players={availablePlayers}
          canAssignTeams={false}
          onAssign={() => { /* no-op when not admin */ }}
        />
      </div>
    )
  }

  // No teams (non-admin view)
  if (teams.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link to="/app/events" className={styles.backLink}>
            &larr; Back to Events
          </Link>
          <h1 className={styles.title}>{event.title}</h1>
          <p className={styles.subtitle}>{formatDate(event.starts_at_utc)}</p>
        </div>

        <div className={styles.empty}>
          <h2>Teams not yet assigned</h2>
          <p>Check back later for team assignments.</p>
        </div>
      </div>
    )
  }

  // Main view with teams
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link to="/app/events" className={styles.backLink}>
          &larr; Back to Events
        </Link>
        <h1 className={styles.title}>{event.title}</h1>
        <p className={styles.subtitle}>{formatDate(event.starts_at_utc)}</p>
        <div className={styles.stats}>
          <span>{totalRsvpYes} RSVP'd yes</span>
        </div>
        {teams.length > 0 && (
          <button
            className={styles.shareBtn}
            onClick={() => setShowShareModal(true)}
            title="Share Teams"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
        )}
      </div>

      {canAssignTeams && (
        <div className={styles.adminBar}>
          <div className={styles.adminBarLeft}>
            <span className={styles.adminLabel}>Admin Mode</span>
            <span className={styles.adminHint}>Tap a player to edit</span>
          </div>
          {canAddMoreTeams && (
            <button
              className={styles.addTeamsBtn}
              onClick={() => setShowAddTeamsModal(true)}
            >
              + Add Teams
            </button>
          )}
        </div>
      )}

      {/* Teams Grid */}
      <div className={styles.teamsGrid}>
        {teams.map((team, index) => (
          <TeamCard
            key={team.id}
            name={team.name}
            assignments={team.assignments}
            color={index === 0 ? '#f8f8f8' : '#1a1a2e'}
            canAssignTeams={canAssignTeams}
            onEditPlayer={setEditingPlayer}
          />
        ))}
      </div>

      {/* Unassigned (have assignment but no team) */}
      {unassigned.length > 0 && (
        <div className={styles.unassignedSection}>
          <h3 className={styles.sectionTitle}>Unassigned to Team ({unassigned.length})</h3>
          <div className={styles.unassignedList}>
            {unassigned.map((a) => (
              <PlayerCard
                key={a.person_id}
                assignment={a}
                canAssignTeams={canAssignTeams}
                onEdit={setEditingPlayer}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available players (RSVP'd yes, no assignment) */}
      <AvailablePlayers
        players={availablePlayers}
        canAssignTeams={canAssignTeams}
        onAssign={handleAssignAvailable}
      />

      {/* Edit Player Modal */}
      {editingPlayer && (
        <EditPlayerModal
          assignment={editingPlayer}
          teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          onSave={handleSaveAssignment}
          onClose={() => setEditingPlayer(null)}
          saving={saving}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
          <div className={styles.shareModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Share Teams</h3>
              <button className={styles.modalClose} onClick={() => setShowShareModal(false)}>
                &times;
              </button>
            </div>

            <div className={styles.sharePreview}>
              <TeamSheet
                ref={teamSheetRef}
                eventTitle={event.title}
                eventDate={formattedDate}
                teams={teams}
                showScheduleNote={showScheduleNote}
              />
            </div>

            <div className={styles.shareActions}>
              <button
                className={styles.btnPrimary}
                onClick={handleShareImage}
                disabled={sharing}
              >
                {sharing ? (
                  <>
                    <Spinner size="sm" />
                    Generating...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Share / Download
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Teams Modal */}
      {showAddTeamsModal && (
        <AddTeamsModal
          existingTeams={teams.map(t => t.name)}
          onAdd={handleAddTeams}
          onClose={() => setShowAddTeamsModal(false)}
          saving={saving}
        />
      )}
    </div>
  )
}
