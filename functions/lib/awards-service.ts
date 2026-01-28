/**
 * Awards Service
 *
 * Centralized logic for checking and granting awards.
 * Call checkAndGrantAwards() from hooks throughout the app.
 */

// =============================================================================
// Types
// =============================================================================

export type AwardTrigger =
  | 'rsvp'           // User RSVP'd to an event
  | 'attendance'     // Attendance was marked
  | 'team_assigned'  // User was assigned to a team
  | 'profile_load'   // User loaded their profile/awards
  | 'scheduled'      // Cron job trigger

export interface RsvpContext {
  eventId: string
  response: 'yes' | 'no' | 'maybe'
  eventKind?: string
  eventStartsAt?: string
  isLateCancel?: boolean
}

export interface AttendanceContext {
  eventId: string
  status: 'present' | 'absent' | 'late' | 'excused'
  eventKind?: string
  eventStartsAt?: string
}

export interface TeamAssignedContext {
  eventId: string
  teamId: string | null
  teamName?: string
  positionCode?: 'F' | 'W' | 'C' | 'B' | null
  activity?: 'play' | 'swim_sets' | 'not_playing' | 'other'
}

export type AwardContext = RsvpContext | AttendanceContext | TeamAssignedContext | Record<string, unknown>

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Check and grant any awards the user has earned.
 * Call this from hooks after relevant actions.
 */
export async function checkAndGrantAwards(
  db: D1Database,
  personId: string,
  trigger: AwardTrigger,
  context: AwardContext = {}
): Promise<string[]> {
  const granted: string[] = []

  try {
    switch (trigger) {
      case 'rsvp':
        granted.push(...await checkRsvpAwards(db, personId, context as RsvpContext))
        break

      case 'attendance':
        granted.push(...await checkAttendanceAwards(db, personId, context as AttendanceContext))
        break

      case 'team_assigned':
        granted.push(...await checkTeamAwards(db, personId, context as TeamAssignedContext))
        break

      case 'profile_load':
        granted.push(...await checkProfileAwards(db, personId))
        break

      case 'scheduled':
        granted.push(...await checkScheduledAwards(db, personId))
        break
    }

    // Always check milestone awards (they apply across triggers)
    granted.push(...await checkMilestoneAwards(db, personId))

  } catch (error) {
    console.error('[AwardsService] Error checking awards:', error)
  }

  return granted
}

// =============================================================================
// Award Granting
// =============================================================================

/**
 * Grant an award (idempotent - won't duplicate)
 */
async function grantAward(
  db: D1Database,
  personId: string,
  awardId: string,
  notes?: string,
  eventId?: string
): Promise<boolean> {
  const id = crypto.randomUUID()

  try {
    const result = await db
      .prepare(`
        INSERT OR IGNORE INTO person_awards (id, person_id, award_id, source, event_id, notes, awarded_at, created_at)
        VALUES (?, ?, ?, 'auto', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `)
      .bind(id, personId, awardId, eventId || null, notes || null)
      .run()

    // Returns true if a row was actually inserted (not ignored due to duplicate)
    return (result.meta?.changes ?? 0) > 0
  } catch (error) {
    console.error(`[AwardsService] Failed to grant ${awardId}:`, error)
    return false
  }
}

/**
 * Check if user already has an award
 */
async function hasAward(db: D1Database, personId: string, awardId: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM person_awards WHERE person_id = ? AND award_id = ?')
    .bind(personId, awardId)
    .first()
  return !!result
}

// =============================================================================
// RSVP Awards
// =============================================================================

async function checkRsvpAwards(
  db: D1Database,
  personId: string,
  context: RsvpContext
): Promise<string[]> {
  const granted: string[] = []

  if (context.response !== 'yes') {
    return granted
  }

  // First Dip - First ever RSVP yes
  if (!await hasAward(db, personId, 'award_first_dip')) {
    const count = await db
      .prepare(`SELECT COUNT(*) as c FROM event_rsvps WHERE person_id = ? AND response = 'yes'`)
      .bind(personId)
      .first<{ c: number }>()

    if (count && count.c === 1) {
      if (await grantAward(db, personId, 'award_first_dip', 'First RSVP yes', context.eventId)) {
        granted.push('award_first_dip')
      }
    }
  }

  // First Friendly - First RSVP yes to a match
  if (context.eventKind === 'match' && !await hasAward(db, personId, 'award_first_friendly')) {
    const matchCount = await db
      .prepare(`
        SELECT COUNT(*) as c FROM event_rsvps er
        JOIN events e ON e.id = er.event_id
        WHERE er.person_id = ? AND er.response = 'yes' AND e.kind = 'match'
      `)
      .bind(personId)
      .first<{ c: number }>()

    if (matchCount && matchCount.c === 1) {
      if (await grantAward(db, personId, 'award_first_friendly', 'First match RSVP', context.eventId)) {
        granted.push('award_first_friendly')
      }
    }
  }

  // Tournament Debut - First RSVP yes to a tournament
  if (context.eventKind === 'tournament' && !await hasAward(db, personId, 'award_tournament_debut')) {
    const tournamentCount = await db
      .prepare(`
        SELECT COUNT(*) as c FROM event_rsvps er
        JOIN events e ON e.id = er.event_id
        WHERE er.person_id = ? AND er.response = 'yes' AND e.kind = 'tournament'
      `)
      .bind(personId)
      .first<{ c: number }>()

    if (tournamentCount && tournamentCount.c === 1) {
      if (await grantAward(db, personId, 'award_tournament_debut', 'First tournament RSVP', context.eventId)) {
        granted.push('award_tournament_debut')
      }
    }
  }

  // Squad Builder - RSVP yes to a session when it already has 12 attendees (you're #13)
  if (context.eventKind === 'session' && !await hasAward(db, personId, 'award_squad_builder')) {
    // Count how many yes RSVPs there were BEFORE this one (excluding current user)
    const priorYesCount = await db
      .prepare(`
        SELECT COUNT(*) as c FROM event_rsvps
        WHERE event_id = ?
          AND person_id != ?
          AND response = 'yes'
          AND (cancelled_late IS NULL OR cancelled_late = 0)
      `)
      .bind(context.eventId, personId)
      .first<{ c: number }>()

    if (priorYesCount && priorYesCount.c === 12) {
      if (await grantAward(db, personId, 'award_squad_builder', 'The 13th player', context.eventId)) {
        granted.push('award_squad_builder')
      }
    }
  }

  // Full Bench - Part of a session with 24 players attending
  if (context.eventKind === 'session' && !await hasAward(db, personId, 'award_full_bench')) {
    // Count total yes RSVPs including this user
    const totalYesCount = await db
      .prepare(`
        SELECT COUNT(*) as c FROM event_rsvps
        WHERE event_id = ?
          AND response = 'yes'
          AND (cancelled_late IS NULL OR cancelled_late = 0)
      `)
      .bind(context.eventId)
      .first<{ c: number }>()

    if (totalYesCount && totalYesCount.c >= 24) {
      if (await grantAward(db, personId, 'award_full_bench', '24 players at session', context.eventId)) {
        granted.push('award_full_bench')
      }
    }
  }

  // Road Trip - RSVP yes to any event outside home locations (not London/M25 area, not K2 Crawley)
  if (!await hasAward(db, personId, 'award_road_trip')) {
    const event = await db
      .prepare('SELECT location FROM events WHERE id = ?')
      .bind(context.eventId)
      .first<{ location: string | null }>()

    if (event?.location) {
      const locationLower = event.location.toLowerCase()
      // Home locations: London/M25 area and regular training venues
      const homeLocations = [
        'london', 'k2', 'crawley', 'west wickham', 'bromley',
        'crystal palace', 'beckenham', 'downham', 'orpington',
        'south norwood', 'camberwell', 'achieve lifestyle', 'egham', 'orbit'
      ]
      const isHomeLocation = homeLocations.some(loc => locationLower.includes(loc))

      if (!isHomeLocation) {
        if (await grantAward(db, personId, 'award_road_trip', `Away event: ${event.location}`, context.eventId)) {
          granted.push('award_road_trip')
        }
      }
    }
  }

  // International Waters - RSVP yes to event outside UK
  if (!await hasAward(db, personId, 'award_international_waters')) {
    const event = await db
      .prepare('SELECT location FROM events WHERE id = ?')
      .bind(context.eventId)
      .first<{ location: string | null }>()

    if (event?.location) {
      const locationLower = event.location.toLowerCase()
      // UK locations - if none of these match, it's international
      const ukLocations = [
        'uk', 'u.k.', 'united kingdom', 'england', 'wales', 'scotland', 'northern ireland',
        'london', 'leeds', 'sheffield', 'bristol', 'guildford', 'sussex', 'st albans',
        'manchester', 'birmingham', 'liverpool', 'newcastle', 'cardiff', 'edinburgh',
        'glasgow', 'belfast', 'nottingham', 'southampton', 'portsmouth', 'brighton',
        'oxford', 'cambridge', 'exeter', 'plymouth', 'norwich', 'coventry', 'leicester',
        'crawley', 'bromley', 'croydon', 'kent', 'surrey', 'essex', 'hertfordshire',
        'egham', 'achieve lifestyle'
      ]
      const isUkLocation = ukLocations.some(loc => locationLower.includes(loc))

      if (!isUkLocation && event.location.trim().length > 0) {
        if (await grantAward(db, personId, 'award_international_waters', `International: ${event.location}`, context.eventId)) {
          granted.push('award_international_waters')
        }
      }
    }
  }

  // Camp Week - RSVP yes to GB Camp event
  if (!await hasAward(db, personId, 'award_camp_week')) {
    const event = await db
      .prepare('SELECT title FROM events WHERE id = ?')
      .bind(context.eventId)
      .first<{ title: string }>()

    if (event?.title) {
      const titleLower = event.title.toLowerCase()
      if (titleLower.includes('camp')) {
        if (await grantAward(db, personId, 'award_camp_week', event.title, context.eventId)) {
          granted.push('award_camp_week')
        }
      }
    }
  }

  // Finals Ready - RSVP yes to BOA, Finals, or Nationals event
  if (!await hasAward(db, personId, 'award_finals_ready')) {
    const event = await db
      .prepare('SELECT title FROM events WHERE id = ?')
      .bind(context.eventId)
      .first<{ title: string }>()

    if (event?.title) {
      const titleLower = event.title.toLowerCase()
      if (titleLower.includes('boa') || titleLower.includes('final') || titleLower.includes('national')) {
        if (await grantAward(db, personId, 'award_finals_ready', event.title, context.eventId)) {
          granted.push('award_finals_ready')
        }
      }
    }
  }

  // Early Bird - RSVP'd more than 7 days before event
  if (context.eventStartsAt) {
    const eventDate = new Date(context.eventStartsAt)
    const now = new Date()
    const daysUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

    if (daysUntil > 7 && !await hasAward(db, personId, 'award_early_bird')) {
      if (await grantAward(db, personId, 'award_early_bird', `RSVP'd ${Math.floor(daysUntil)} days early`, context.eventId)) {
        granted.push('award_early_bird')
      }
    }
  }

  // Last Minute Hero - RSVP'd yes within 2 hours of event start
  if (context.eventStartsAt) {
    const eventDate = new Date(context.eventStartsAt)
    const now = new Date()
    const hoursUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (hoursUntil > 0 && hoursUntil <= 2 && !await hasAward(db, personId, 'award_last_minute_hero')) {
      if (await grantAward(db, personId, 'award_last_minute_hero', 'Clutch last-minute RSVP', context.eventId)) {
        granted.push('award_last_minute_hero')
      }
    }
  }

  // Check streak awards on RSVP
  granted.push(...await checkStreakAwards(db, personId))

  return granted
}

// =============================================================================
// Attendance Awards
// =============================================================================

async function checkAttendanceAwards(
  db: D1Database,
  personId: string,
  context: AttendanceContext
): Promise<string[]> {
  const granted: string[] = []

  if (context.status !== 'present' && context.status !== 'late') {
    return granted
  }

  // Day-specific awards
  if (context.eventStartsAt) {
    const eventDate = new Date(context.eventStartsAt)
    const dayOfWeek = eventDate.getUTCDay() // 0 = Sunday, 4 = Thursday

    // Thursday Regular - 10 Thursday sessions
    if (dayOfWeek === 4) {
      const thursdayCount = await countAttendanceByDay(db, personId, 4)
      if (thursdayCount >= 10 && !await hasAward(db, personId, 'award_thursday_regular')) {
        if (await grantAward(db, personId, 'award_thursday_regular', `${thursdayCount} Thursday sessions`)) {
          granted.push('award_thursday_regular')
        }
      }
    }

    // Sunday Specialist - 10 Sunday sessions
    if (dayOfWeek === 0) {
      const sundayCount = await countAttendanceByDay(db, personId, 0)
      if (sundayCount >= 10 && !await hasAward(db, personId, 'award_sunday_specialist')) {
        if (await grantAward(db, personId, 'award_sunday_specialist', `${sundayCount} Sunday sessions`)) {
          granted.push('award_sunday_specialist')
        }
      }
    }

    // New Year Splash - First session of the calendar year
    const month = eventDate.getUTCMonth()
    const day = eventDate.getUTCDate()
    if (month === 0 && day <= 7) { // First week of January
      const year = eventDate.getUTCFullYear()
      if (!await hasAward(db, personId, 'award_new_year_splash')) {
        if (await grantAward(db, personId, 'award_new_year_splash', `New Year ${year}`)) {
          granted.push('award_new_year_splash')
        }
      }
    }
  }

  return granted
}

async function countAttendanceByDay(db: D1Database, personId: string, dayOfWeek: number): Promise<number> {
  // SQLite: strftime('%w', date) returns day of week (0 = Sunday)
  const result = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_attendance ea
      JOIN events e ON e.id = ea.event_id
      WHERE ea.person_id = ?
        AND ea.status IN ('present', 'late')
        AND CAST(strftime('%w', e.starts_at_utc) AS INTEGER) = ?
    `)
    .bind(personId, dayOfWeek)
    .first<{ c: number }>()

  return result?.c ?? 0
}

// =============================================================================
// Team Awards
// =============================================================================

async function checkTeamAwards(
  db: D1Database,
  personId: string,
  context: TeamAssignedContext
): Promise<string[]> {
  const granted: string[] = []

  if (!context.teamName || context.activity !== 'play') {
    return granted
  }

  const teamNameLower = context.teamName.toLowerCase()

  // White Cap - Assigned to white team 5 times
  if (teamNameLower.includes('white')) {
    const whiteCount = await countTeamAssignments(db, personId, 'white')
    if (whiteCount >= 5 && !await hasAward(db, personId, 'award_white_cap')) {
      if (await grantAward(db, personId, 'award_white_cap', `${whiteCount} white team assignments`)) {
        granted.push('award_white_cap')
      }
    }
  }

  // Black Cap - Assigned to black team 5 times
  if (teamNameLower.includes('black')) {
    const blackCount = await countTeamAssignments(db, personId, 'black')
    if (blackCount >= 5 && !await hasAward(db, personId, 'award_black_cap')) {
      if (await grantAward(db, personId, 'award_black_cap', `${blackCount} black team assignments`)) {
        granted.push('award_black_cap')
      }
    }
  }

  // Third Team - Assigned to a team that isn't white or black
  if (!teamNameLower.includes('white') && !teamNameLower.includes('black')) {
    if (!await hasAward(db, personId, 'award_third_team')) {
      if (await grantAward(db, personId, 'award_third_team', `Assigned to ${context.teamName}`)) {
        granted.push('award_third_team')
      }
    }
  }

  // Captain's Pick - First person selected to a team by someone with captain role
  if (!await hasAward(db, personId, 'award_captains_pick')) {
    // Check if this is the first team assignment for this event
    const assignmentCount = await db
      .prepare(`
        SELECT COUNT(*) as c FROM event_team_assignments
        WHERE event_id = ? AND team_id IS NOT NULL
      `)
      .bind(context.eventId)
      .first<{ c: number }>()

    // If this is the first assignment (count = 1, which is this one)
    if (assignmentCount && assignmentCount.c === 1) {
      // Check if the assigner has a captain role
      const assignment = await db
        .prepare(`
          SELECT eta.assigned_by_person_id
          FROM event_team_assignments eta
          WHERE eta.event_id = ? AND eta.person_id = ?
        `)
        .bind(context.eventId, personId)
        .first<{ assigned_by_person_id: string | null }>()

      if (assignment?.assigned_by_person_id) {
        // Check if assigner has captain role in any group
        const isCaptain = await db
          .prepare(`
            SELECT 1 FROM group_members
            WHERE person_id = ? AND group_role = 'captain'
            LIMIT 1
          `)
          .bind(assignment.assigned_by_person_id)
          .first()

        if (isCaptain) {
          if (await grantAward(db, personId, 'award_captains_pick', 'First pick by captain')) {
            granted.push('award_captains_pick')
          }
        }
      }
    }
  }

  // Position-based awards (10 times in position)
  if (context.positionCode) {
    const positionCount = await countPositionAssignments(db, personId, context.positionCode)

    if (positionCount >= 10) {
      const positionAwards: Record<string, string> = {
        'F': 'award_forward_line',
        'W': 'award_wing_runner',
        'C': 'award_centre_control',
        'B': 'award_backline_anchor',
      }

      const awardId = positionAwards[context.positionCode]
      if (awardId && !await hasAward(db, personId, awardId)) {
        if (await grantAward(db, personId, awardId, `${positionCount} times at ${context.positionCode}`)) {
          granted.push(awardId)
        }
      }
    }

    // Utility Player - Played all 4 positions at least once
    const positions = await getDistinctPositions(db, personId)
    if (positions.length >= 4 && !await hasAward(db, personId, 'award_utility_player')) {
      if (await grantAward(db, personId, 'award_utility_player', 'Played all positions')) {
        granted.push('award_utility_player')
      }
    }
  }

  return granted
}

async function countTeamAssignments(db: D1Database, personId: string, teamColor: string): Promise<number> {
  const result = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_team_assignments eta
      JOIN event_teams et ON et.id = eta.team_id
      WHERE eta.person_id = ?
        AND eta.activity = 'play'
        AND LOWER(et.name) LIKE ?
    `)
    .bind(personId, `%${teamColor}%`)
    .first<{ c: number }>()

  return result?.c ?? 0
}

async function countPositionAssignments(db: D1Database, personId: string, positionCode: string): Promise<number> {
  const result = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_team_assignments
      WHERE person_id = ? AND position_code = ?
    `)
    .bind(personId, positionCode)
    .first<{ c: number }>()

  return result?.c ?? 0
}

async function getDistinctPositions(db: D1Database, personId: string): Promise<string[]> {
  const result = await db
    .prepare(`
      SELECT DISTINCT position_code
      FROM event_team_assignments
      WHERE person_id = ? AND position_code IS NOT NULL
    `)
    .bind(personId)
    .all<{ position_code: string }>()

  return result.results.map(r => r.position_code)
}

// =============================================================================
// Streak Awards
// =============================================================================

async function checkStreakAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []
  const streak = await calculateStreak(db, personId)

  // Back-to-Back (2 streak)
  if (streak >= 2 && !await hasAward(db, personId, 'award_back_to_back')) {
    if (await grantAward(db, personId, 'award_back_to_back', `Streak of ${streak}`)) {
      granted.push('award_back_to_back')
    }
  }

  // Triple Threat (3 streak)
  if (streak >= 3 && !await hasAward(db, personId, 'award_triple_threat')) {
    if (await grantAward(db, personId, 'award_triple_threat', `Streak of ${streak}`)) {
      granted.push('award_triple_threat')
    }
  }

  // Four Week Flow (8 sessions = ~4 weeks with 2/week)
  if (streak >= 8 && !await hasAward(db, personId, 'award_four_week_flow')) {
    if (await grantAward(db, personId, 'award_four_week_flow', `Streak of ${streak}`)) {
      granted.push('award_four_week_flow')
    }
  }

  // Twelve Week Habit (24 sessions = ~12 weeks with 2/week)
  if (streak >= 24 && !await hasAward(db, personId, 'award_twelve_week_habit')) {
    if (await grantAward(db, personId, 'award_twelve_week_habit', `Streak of ${streak}`)) {
      granted.push('award_twelve_week_habit')
    }
  }

  // Perfect Week - attended all sessions in a week
  if (!await hasAward(db, personId, 'award_perfect_week')) {
    const hasPerfectWeek = await checkPerfectWeek(db, personId)
    if (hasPerfectWeek) {
      if (await grantAward(db, personId, 'award_perfect_week', 'Attended all sessions in a week')) {
        granted.push('award_perfect_week')
      }
    }
  }

  // Unbroken Month - attended all sessions in a calendar month
  if (!await hasAward(db, personId, 'award_unbroken_month')) {
    const hasUnbrokenMonth = await checkUnbrokenMonth(db, personId)
    if (hasUnbrokenMonth) {
      if (await grantAward(db, personId, 'award_unbroken_month', 'Attended all sessions in a month')) {
        granted.push('award_unbroken_month')
      }
    }
  }

  // Streak Saver - missed a week then came back the very next week
  if (!await hasAward(db, personId, 'award_streak_saver')) {
    const hasStreakSaver = await checkStreakSaver(db, personId)
    if (hasStreakSaver) {
      if (await grantAward(db, personId, 'award_streak_saver', 'Missed a week but came back')) {
        granted.push('award_streak_saver')
      }
    }
  }

  return granted
}

/**
 * Check if user has ever attended all sessions in a single week
 */
async function checkPerfectWeek(db: D1Database, personId: string): Promise<boolean> {
  // Get all weeks where there were sessions and check if user attended all
  // A "perfect week" = user RSVP'd yes to ALL session events that week (no late cancels)
  const result = await db
    .prepare(`
      WITH weekly_sessions AS (
        SELECT
          strftime('%Y-%W', e.starts_at_utc) as year_week,
          e.id as event_id
        FROM events e
        WHERE e.kind = 'session'
          AND e.starts_at_utc < datetime('now')
      ),
      user_attended AS (
        SELECT
          strftime('%Y-%W', e.starts_at_utc) as year_week,
          e.id as event_id
        FROM events e
        JOIN event_rsvps er ON er.event_id = e.id
        WHERE er.person_id = ?
          AND er.response = 'yes'
          AND (er.cancelled_late IS NULL OR er.cancelled_late = 0)
          AND e.kind = 'session'
          AND e.starts_at_utc < datetime('now')
      ),
      week_stats AS (
        SELECT
          ws.year_week,
          COUNT(DISTINCT ws.event_id) as total_sessions,
          COUNT(DISTINCT ua.event_id) as attended_sessions
        FROM weekly_sessions ws
        LEFT JOIN user_attended ua ON ua.year_week = ws.year_week AND ua.event_id = ws.event_id
        GROUP BY ws.year_week
        HAVING total_sessions >= 2
      )
      SELECT COUNT(*) as perfect_weeks
      FROM week_stats
      WHERE total_sessions = attended_sessions
    `)
    .bind(personId)
    .first<{ perfect_weeks: number }>()

  return (result?.perfect_weeks ?? 0) > 0
}

/**
 * Check if user has ever attended all sessions in a calendar month
 */
async function checkUnbrokenMonth(db: D1Database, personId: string): Promise<boolean> {
  const result = await db
    .prepare(`
      WITH monthly_sessions AS (
        SELECT
          strftime('%Y-%m', e.starts_at_utc) as year_month,
          e.id as event_id
        FROM events e
        WHERE e.kind = 'session'
          AND e.starts_at_utc < datetime('now')
      ),
      user_attended AS (
        SELECT
          strftime('%Y-%m', e.starts_at_utc) as year_month,
          e.id as event_id
        FROM events e
        JOIN event_rsvps er ON er.event_id = e.id
        WHERE er.person_id = ?
          AND er.response = 'yes'
          AND (er.cancelled_late IS NULL OR er.cancelled_late = 0)
          AND e.kind = 'session'
          AND e.starts_at_utc < datetime('now')
      ),
      month_stats AS (
        SELECT
          ms.year_month,
          COUNT(DISTINCT ms.event_id) as total_sessions,
          COUNT(DISTINCT ua.event_id) as attended_sessions
        FROM monthly_sessions ms
        LEFT JOIN user_attended ua ON ua.year_month = ms.year_month AND ua.event_id = ms.event_id
        GROUP BY ms.year_month
        HAVING total_sessions >= 4
      )
      SELECT COUNT(*) as perfect_months
      FROM month_stats
      WHERE total_sessions = attended_sessions
    `)
    .bind(personId)
    .first<{ perfect_months: number }>()

  return (result?.perfect_months ?? 0) > 0
}

/**
 * Check if user has ever "saved their streak" - missed all sessions one week
 * but came back the very next week
 */
async function checkStreakSaver(db: D1Database, personId: string): Promise<boolean> {
  // Find pattern: attended week N, missed all of week N+1, attended week N+2
  const result = await db
    .prepare(`
      WITH weekly_sessions AS (
        SELECT
          strftime('%Y-%W', e.starts_at_utc) as year_week,
          e.id as event_id
        FROM events e
        WHERE e.kind = 'session'
          AND e.starts_at_utc < datetime('now')
      ),
      user_attendance_by_week AS (
        SELECT
          ws.year_week,
          COUNT(DISTINCT ws.event_id) as total_sessions,
          COUNT(DISTINCT CASE
            WHEN er.response = 'yes' AND (er.cancelled_late IS NULL OR er.cancelled_late = 0)
            THEN ws.event_id
          END) as attended_sessions
        FROM weekly_sessions ws
        LEFT JOIN event_rsvps er ON er.event_id = ws.event_id AND er.person_id = ?
        GROUP BY ws.year_week
        HAVING total_sessions > 0
      ),
      ordered_weeks AS (
        SELECT
          year_week,
          total_sessions,
          attended_sessions,
          LAG(attended_sessions, 1) OVER (ORDER BY year_week) as prev_attended,
          LAG(attended_sessions, 2) OVER (ORDER BY year_week) as prev_prev_attended,
          LAG(year_week, 1) OVER (ORDER BY year_week) as prev_week,
          LAG(year_week, 2) OVER (ORDER BY year_week) as prev_prev_week
        FROM user_attendance_by_week
      )
      SELECT COUNT(*) as streak_saves
      FROM ordered_weeks
      WHERE attended_sessions > 0
        AND prev_attended = 0
        AND prev_prev_attended > 0
        AND prev_week IS NOT NULL
        AND prev_prev_week IS NOT NULL
    `)
    .bind(personId)
    .first<{ streak_saves: number }>()

  return (result?.streak_saves ?? 0) > 0
}

async function calculateStreak(db: D1Database, personId: string): Promise<number> {
  const events = await db
    .prepare(`
      SELECT
        e.id,
        er.cancelled_late
      FROM events e
      JOIN event_rsvps er ON er.event_id = e.id
      WHERE er.person_id = ?
        AND e.kind IN ('session', 'training', 'ladies')
        AND e.starts_at_utc < datetime('now')
        AND er.response = 'yes'
      ORDER BY e.starts_at_utc DESC
      LIMIT 50
    `)
    .bind(personId)
    .all<{ id: string; cancelled_late: number | null }>()

  let streak = 0
  for (const event of events.results) {
    if (event.cancelled_late === 1) break
    streak++
  }

  return streak
}

// =============================================================================
// Milestone Awards (Session Count)
// =============================================================================

async function checkMilestoneAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []

  // Count total sessions attended
  const totalSessions = await countTotalSessions(db, personId)

  const milestones: Array<{ count: number; awardId: string }> = [
    { count: 5, awardId: 'award_sessions_5' },
    { count: 10, awardId: 'award_sessions_10' },
    { count: 25, awardId: 'award_sessions_25' },
    { count: 50, awardId: 'award_sessions_50' },
    { count: 100, awardId: 'award_sessions_100' },
    { count: 200, awardId: 'award_club_200' },
  ]

  for (const milestone of milestones) {
    if (totalSessions >= milestone.count && !await hasAward(db, personId, milestone.awardId)) {
      if (await grantAward(db, personId, milestone.awardId, `${totalSessions} total sessions`)) {
        granted.push(milestone.awardId)
      }
    }
  }

  // Season Centurion - 100 sessions in a single season (Sept-Aug)
  if (!await hasAward(db, personId, 'award_season_centurion')) {
    const hasSeasonCenturion = await checkSeasonCenturion(db, personId)
    if (hasSeasonCenturion) {
      if (await grantAward(db, personId, 'award_season_centurion', '100 sessions in a season')) {
        granted.push('award_season_centurion')
      }
    }
  }

  return granted
}

/**
 * Check if user has attended 100+ sessions in any single season (Sept-Aug)
 */
async function checkSeasonCenturion(db: D1Database, personId: string): Promise<boolean> {
  // Season runs September to August
  // Calculate season as: if month >= 9, season = year, else season = year - 1
  const result = await db
    .prepare(`
      WITH session_seasons AS (
        SELECT
          CASE
            WHEN CAST(strftime('%m', e.starts_at_utc) AS INTEGER) >= 9
            THEN strftime('%Y', e.starts_at_utc)
            ELSE CAST(CAST(strftime('%Y', e.starts_at_utc) AS INTEGER) - 1 AS TEXT)
          END as season_year
        FROM events e
        JOIN event_rsvps er ON er.event_id = e.id
        WHERE er.person_id = ?
          AND er.response = 'yes'
          AND (er.cancelled_late IS NULL OR er.cancelled_late = 0)
          AND e.kind IN ('session', 'training', 'ladies')
          AND e.starts_at_utc < datetime('now')
      )
      SELECT season_year, COUNT(*) as session_count
      FROM session_seasons
      GROUP BY season_year
      HAVING session_count >= 100
      LIMIT 1
    `)
    .bind(personId)
    .first<{ season_year: string; session_count: number }>()

  return !!result
}

async function countTotalSessions(db: D1Database, personId: string): Promise<number> {
  // Count RSVPs with 'yes' for past events (or attendance if tracked)
  const result = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_rsvps er
      JOIN events e ON e.id = er.event_id
      WHERE er.person_id = ?
        AND er.response = 'yes'
        AND er.cancelled_late IS NOT 1
        AND e.starts_at_utc < datetime('now')
        AND e.kind IN ('session', 'training', 'ladies')
    `)
    .bind(personId)
    .first<{ c: number }>()

  return result?.c ?? 0
}

// =============================================================================
// Profile Load Awards (checked on profile/awards page load)
// =============================================================================

async function checkProfileAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []

  // Check anniversary awards
  granted.push(...await checkAnniversaryAwards(db, personId))

  // Check reliability awards
  granted.push(...await checkReliabilityAwards(db, personId))

  return granted
}

async function checkAnniversaryAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []

  // Get first ever RSVP date
  const firstRsvp = await db
    .prepare(`
      SELECT MIN(er.responded_at) as first_date
      FROM event_rsvps er
      WHERE er.person_id = ? AND er.response = 'yes'
    `)
    .bind(personId)
    .first<{ first_date: string | null }>()

  if (!firstRsvp?.first_date) return granted

  const firstDate = new Date(firstRsvp.first_date)
  const now = new Date()
  const yearsActive = (now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365)

  // 1 Year Anniversary
  if (yearsActive >= 1 && !await hasAward(db, personId, 'award_anniversary_1y')) {
    if (await grantAward(db, personId, 'award_anniversary_1y', `Member since ${firstDate.getFullYear()}`)) {
      granted.push('award_anniversary_1y')
    }
  }

  // 5 Year Anniversary
  if (yearsActive >= 5 && !await hasAward(db, personId, 'award_anniversary_5y')) {
    if (await grantAward(db, personId, 'award_anniversary_5y', `${Math.floor(yearsActive)} years`)) {
      granted.push('award_anniversary_5y')
    }
  }

  // 10 Year Anniversary
  if (yearsActive >= 10 && !await hasAward(db, personId, 'award_anniversary_10y')) {
    if (await grantAward(db, personId, 'award_anniversary_10y', `${Math.floor(yearsActive)} years`)) {
      granted.push('award_anniversary_10y')
    }
  }

  return granted
}

async function checkReliabilityAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []

  // On Time - RSVP'd to 20+ events more than 24 hours in advance
  const earlyRsvps = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_rsvps er
      JOIN events e ON e.id = er.event_id
      WHERE er.person_id = ?
        AND er.response = 'yes'
        AND julianday(e.starts_at_utc) - julianday(er.responded_at) > 1
    `)
    .bind(personId)
    .first<{ c: number }>()

  if ((earlyRsvps?.c ?? 0) >= 20 && !await hasAward(db, personId, 'award_on_time')) {
    if (await grantAward(db, personId, 'award_on_time', `${earlyRsvps?.c} early RSVPs`)) {
      granted.push('award_on_time')
    }
  }

  // Dependable - 25+ sessions with no late cancellations
  const stats = await db
    .prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN cancelled_late = 1 THEN 1 ELSE 0 END) as late_cancels
      FROM event_rsvps er
      JOIN events e ON e.id = er.event_id
      WHERE er.person_id = ?
        AND er.response = 'yes'
        AND e.starts_at_utc < datetime('now')
    `)
    .bind(personId)
    .first<{ total: number; late_cancels: number }>()

  if (stats && stats.total >= 25 && stats.late_cancels === 0 && !await hasAward(db, personId, 'award_dependable')) {
    if (await grantAward(db, personId, 'award_dependable', `${stats.total} sessions, 0 late cancels`)) {
      granted.push('award_dependable')
    }
  }

  // Ironclad - 50+ sessions with no late cancellations
  if (stats && stats.total >= 50 && stats.late_cancels === 0 && !await hasAward(db, personId, 'award_ironclad')) {
    if (await grantAward(db, personId, 'award_ironclad', `${stats.total} sessions, 0 late cancels`)) {
      granted.push('award_ironclad')
    }
  }

  // Always Ready - RSVP'd within 24 hours of event being visible for 15+ events
  const quickRsvps = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_rsvps er
      JOIN events e ON e.id = er.event_id
      WHERE er.person_id = ?
        AND er.response = 'yes'
        AND e.visible_from IS NOT NULL
        AND julianday(er.responded_at) - julianday(e.visible_from) <= 1
    `)
    .bind(personId)
    .first<{ c: number }>()

  if ((quickRsvps?.c ?? 0) >= 15 && !await hasAward(db, personId, 'award_always_ready')) {
    if (await grantAward(db, personId, 'award_always_ready', `${quickRsvps?.c} quick RSVPs`)) {
      granted.push('award_always_ready')
    }
  }

  return granted
}

// =============================================================================
// Scheduled Awards (for cron jobs)
// =============================================================================

async function checkScheduledAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []

  // Check all time-sensitive awards
  granted.push(...await checkAnniversaryAwards(db, personId))
  granted.push(...await checkSeasonalAwards(db, personId))

  return granted
}

async function checkSeasonalAwards(db: D1Database, personId: string): Promise<string[]> {
  const granted: string[] = []
  const now = new Date()
  const month = now.getUTCMonth()

  // Spring Surge (March-May) - Attended 10+ sessions in spring
  if (month >= 2 && month <= 4) {
    const year = now.getUTCFullYear()
    const springCount = await countSessionsInPeriod(db, personId, `${year}-03-01`, `${year}-05-31`)
    if (springCount >= 10 && !await hasAward(db, personId, 'award_spring_surge')) {
      if (await grantAward(db, personId, 'award_spring_surge', `${springCount} spring sessions ${year}`)) {
        granted.push('award_spring_surge')
      }
    }
  }

  // Summer Series (June-August) - Attended 10+ sessions in summer
  if (month >= 5 && month <= 7) {
    const year = now.getUTCFullYear()
    const summerCount = await countSessionsInPeriod(db, personId, `${year}-06-01`, `${year}-08-31`)
    if (summerCount >= 10 && !await hasAward(db, personId, 'award_summer_series')) {
      if (await grantAward(db, personId, 'award_summer_series', `${summerCount} summer sessions ${year}`)) {
        granted.push('award_summer_series')
      }
    }
  }

  return granted
}

async function countSessionsInPeriod(db: D1Database, personId: string, startDate: string, endDate: string): Promise<number> {
  const result = await db
    .prepare(`
      SELECT COUNT(*) as c
      FROM event_rsvps er
      JOIN events e ON e.id = er.event_id
      WHERE er.person_id = ?
        AND er.response = 'yes'
        AND er.cancelled_late IS NOT 1
        AND e.starts_at_utc >= ?
        AND e.starts_at_utc <= ?
        AND e.kind IN ('session', 'training', 'ladies')
    `)
    .bind(personId, startDate, endDate)
    .first<{ c: number }>()

  return result?.c ?? 0
}

// =============================================================================
// Bulk Check (for cron jobs to process all users)
// =============================================================================

/**
 * Check awards for all active users (for scheduled jobs)
 */
export async function checkAwardsForAllUsers(db: D1Database): Promise<{ checked: number; awarded: number }> {
  // Get all users who have RSVP'd in the last 90 days
  const activeUsers = await db
    .prepare(`
      SELECT DISTINCT er.person_id
      FROM event_rsvps er
      WHERE er.responded_at > datetime('now', '-90 days')
    `)
    .all<{ person_id: string }>()

  let totalAwarded = 0

  for (const user of activeUsers.results) {
    const granted = await checkAndGrantAwards(db, user.person_id, 'scheduled', {})
    totalAwarded += granted.length
  }

  return {
    checked: activeUsers.results.length,
    awarded: totalAwarded,
  }
}
