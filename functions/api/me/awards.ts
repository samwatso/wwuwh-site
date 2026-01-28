/**
 * User Awards Endpoint
 * GET /api/me/awards - Get current user's awards and streaks
 *
 * Returns:
 * - awards: Array of earned awards with details
 * - current_streak: Current session streak count
 * - available_awards: Awards the user hasn't earned yet (optional)
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'

interface Award {
  id: string
  name: string
  description: string
  icon: string | null
}

interface PersonAward {
  id: string
  award_id: string
  awarded_at: string
  notes: string | null
  name: string
  description: string
  icon: string | null
}

interface EligibleEvent {
  id: string
  starts_at_utc: string
  response: string
  responded_at: string
  cancelled_late: number | null
}

// Eligible event kinds for streak calculation
const STREAK_ELIGIBLE_KINDS = ['session', 'training', 'ladies']

/**
 * Calculate the current session streak for a user
 * A streak is maintained when user:
 * 1. RSVPs "yes" to eligible events (session, training, ladies)
 * 2. Does not have cancelled_late = 1 (last-minute dropout)
 */
async function calculateStreak(db: D1Database, personId: string): Promise<number> {
  // Get past eligible events the user RSVP'd yes to, ordered by date desc
  const events = await db
    .prepare(`
      SELECT
        e.id,
        e.starts_at_utc,
        er.response,
        er.responded_at,
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
    .all<EligibleEvent>()

  let streak = 0
  for (const event of events.results) {
    // If they cancelled late (dropped out), streak is broken
    if (event.cancelled_late === 1) {
      break
    }
    streak++
  }

  return streak
}

/**
 * Grant an award to a user (idempotent)
 */
async function grantAward(
  db: D1Database,
  personId: string,
  awardId: string,
  notes?: string
): Promise<boolean> {
  const id = crypto.randomUUID()

  try {
    await db
      .prepare(`
        INSERT OR IGNORE INTO person_awards (id, person_id, award_id, source, notes, awarded_at, created_at)
        VALUES (?, ?, ?, 'auto', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `)
      .bind(id, personId, awardId, notes || null)
      .run()
    return true
  } catch {
    return false
  }
}

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    // Find person by auth_user_id
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Calculate current streak
    const currentStreak = await calculateStreak(db, person.id)

    // Check and grant 3 session streak award if earned
    if (currentStreak >= 3) {
      await grantAward(db, person.id, 'award_triple_threat', `Streak of ${currentStreak}`)
    }

    // Fetch user's earned awards
    const personAwards = await db
      .prepare(`
        SELECT
          pa.id,
          pa.award_id,
          pa.awarded_at,
          pa.notes,
          a.name,
          a.description,
          a.icon
        FROM person_awards pa
        JOIN awards a ON a.id = pa.award_id
        WHERE pa.person_id = ?
        ORDER BY pa.awarded_at DESC
      `)
      .bind(person.id)
      .all<PersonAward>()

    // Fetch all available awards for "locked" display
    const allAwards = await db
      .prepare('SELECT id, name, description, icon FROM awards ORDER BY name')
      .all<Award>()

    // Build locked awards (awards user hasn't earned)
    const earnedIds = new Set(personAwards.results.map(a => a.award_id))
    const lockedAwards = allAwards.results.filter(a => !earnedIds.has(a.id))

    return jsonResponse({
      awards: personAwards.results.map(a => ({
        id: a.id,
        award_id: a.award_id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        granted_at: a.awarded_at,
        meta: a.notes ? { notes: a.notes } : null,
      })),
      locked_awards: lockedAwards,
      current_streak: currentStreak,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
