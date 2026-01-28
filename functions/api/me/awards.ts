/**
 * User Awards Endpoint
 * GET /api/me/awards - Get current user's awards and streaks
 *
 * Returns:
 * - awards: Array of earned awards with details
 * - current_streak: Current session streak count
 * - locked_awards: Awards the user hasn't earned yet
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'
import { checkAndGrantAwards } from '../../lib/awards-service'

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
  event_id: string | null
  event_title: string | null
  name: string
  description: string
  icon: string | null
}

/**
 * Calculate the current session streak for a user
 */
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

    // Check and grant any awards earned (profile load checks)
    // This covers: anniversaries, reliability, milestones, streaks
    await checkAndGrantAwards(context.env, db, person.id, 'profile_load', {})

    // Fetch user's earned awards with event details if applicable
    const personAwards = await db
      .prepare(`
        SELECT
          pa.id,
          pa.award_id,
          pa.awarded_at,
          pa.notes,
          pa.event_id,
          e.title as event_title,
          a.name,
          a.description,
          a.icon
        FROM person_awards pa
        JOIN awards a ON a.id = pa.award_id
        LEFT JOIN events e ON e.id = pa.event_id
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
        event_id: a.event_id,
        event_title: a.event_title,
        context: a.notes || null,
      })),
      locked_awards: lockedAwards,
      current_streak: currentStreak,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
