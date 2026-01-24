/**
 * TeamSheet Component
 *
 * A styled component for displaying teams suitable for export/sharing as an image.
 * Designed to look good when captured as an image.
 */

import { forwardRef } from 'react'
import type { TeamWithAssignments } from '@/lib/api'
import { Avatar } from './Avatar'
import styles from './TeamSheet.module.css'

// Position display names and order
const POSITIONS = [
  { code: 'F', name: 'Forward' },
  { code: 'W', name: 'Wing' },
  { code: 'C', name: 'Centre' },
  { code: 'B', name: 'Back' },
] as const

// Format name as "First L" (first name + first initial of surname)
function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const firstName = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || ''
  return `${firstName} ${lastInitial}`
}

interface TeamSheetProps {
  eventTitle: string
  eventDate: string
  teams: TeamWithAssignments[]
  showScheduleNote?: boolean
}

export const TeamSheet = forwardRef<HTMLDivElement, TeamSheetProps>(
  ({ eventTitle, eventDate, teams, showScheduleNote = false }, ref) => {
    // Determine layout class based on team count
    const teamCount = teams.length
    const layoutClass = teamCount <= 2 ? styles.twoTeams : teamCount === 3 ? styles.threeTeams : styles.fourTeams
    // Group assignments by position for a team
    // Excludes dropouts (cancelled_late) and no-shows (attendance_status === 'absent')
    const getPlayersByPosition = (assignments: TeamWithAssignments['assignments']) => {
      const grouped = new Map<string, typeof assignments>()
      POSITIONS.forEach((pos) => grouped.set(pos.code, []))
      grouped.set('none', [])

      assignments
        .filter((a) => a.activity === 'play' && !a.cancelled_late && a.attendance_status !== 'absent')
        .forEach((a) => {
          const key = a.position_code || 'none'
          const group = grouped.get(key) || []
          group.push(a)
          grouped.set(key, group)
        })

      return grouped
    }

    return (
      <div ref={ref} className={styles.sheet}>
        {/* Header */}
        <div className={styles.header}>
          <img src="/app/assets/logo.png" alt="WWUWH" className={styles.logo} />
          <h1 className={styles.title}>{eventTitle}</h1>
          <p className={styles.date}>{eventDate}</p>
        </div>

        {/* Teams */}
        <div className={`${styles.teamsContainer} ${layoutClass}`}>
          {teams.map((team) => {
            const playersByPosition = getPlayersByPosition(team.assignments)
            const isBlackTeam = team.name.toLowerCase() === 'black'
            // Count only active players (exclude dropouts and no-shows)
            const playingCount = team.assignments.filter(
              (a) => a.activity === 'play' && !a.cancelled_late && a.attendance_status !== 'absent'
            ).length

            return (
              <div
                key={team.id}
                className={`${styles.team} ${isBlackTeam ? styles.teamBlack : styles.teamWhite}`}
              >
                <div className={styles.teamHeader}>
                  <h2 className={styles.teamName}>{team.name}</h2>
                  <span className={styles.teamCount}>{playingCount} players</span>
                </div>

                <div className={styles.teamBody}>
                  {POSITIONS.map((pos) => {
                    const players = playersByPosition.get(pos.code) || []
                    if (players.length === 0) return null

                    return (
                      <div key={pos.code} className={styles.positionGroup}>
                        <div className={styles.positionHeader}>{pos.name}</div>
                        <div className={styles.positionPlayers}>
                          {players.map((p) => (
                            <div key={p.person_id} className={styles.player}>
                              <Avatar
                                src={p.person_photo_url}
                                name={p.person_name}
                                size="xs"
                                className={styles.playerAvatar}
                              />
                              <span className={styles.playerName}>{formatShortName(p.person_name)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Players without position */}
                  {(() => {
                    const noPos = playersByPosition.get('none') || []
                    if (noPos.length === 0) return null
                    return (
                      <div className={styles.positionGroup}>
                        <div className={styles.positionHeader}>Other</div>
                        <div className={styles.positionPlayers}>
                          {noPos.map((p) => (
                            <div key={p.person_id} className={styles.player}>
                              <Avatar
                                src={p.person_photo_url}
                                name={p.person_name}
                                size="xs"
                                className={styles.playerAvatar}
                              />
                              <span className={styles.playerName}>{formatShortName(p.person_name)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Schedule Note for 3+ teams */}
        {showScheduleNote && (
          <div className={styles.scheduleNote}>
            Game schedule TBC via WhatsApp
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <span>West Wickham Underwater Hockey</span>
        </div>
      </div>
    )
  }
)

TeamSheet.displayName = 'TeamSheet'
