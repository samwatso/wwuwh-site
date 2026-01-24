/**
 * Event Teams Endpoint
 * GET  /api/events/[id]/teams - Get teams and assignments
 * POST /api/events/[id]/teams - Create/update teams (admin)
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth, AuthUser } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface EventTeam {
  id: string
  event_id: string
  name: string
  sort_order: number
  created_at: string
}

interface TeamAssignment {
  event_id: string
  person_id: string
  team_id: string | null
  activity: 'play' | 'swim_sets' | 'not_playing' | 'other'
  position_code: 'F' | 'W' | 'C' | 'B' | null
  notes: string | null
  assigned_at: string
  person_name: string
  person_email: string
  person_photo_url: string | null
  attendance_status: 'present' | 'absent' | 'late' | 'excused' | null
  cancelled_late: boolean
}

interface TeamWithAssignments extends EventTeam {
  assignments: TeamAssignment[]
}

/**
 * GET /api/events/[id]/teams
 * Returns teams and player assignments for an event
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get event details
    const event = await db
      .prepare('SELECT id, club_id, title, starts_at_utc FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, clubId)
      .first()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Get teams for this event
    const teams = await db
      .prepare(`
        SELECT id, event_id, name, sort_order, created_at
        FROM event_teams
        WHERE event_id = ?
        ORDER BY sort_order, name
      `)
      .bind(eventId)
      .all<EventTeam>()

    // Get all assignments with person details, attendance status, and late cancellation flag
    const assignments = await db
      .prepare(`
        SELECT
          eta.event_id,
          eta.person_id,
          eta.team_id,
          eta.activity,
          eta.position_code,
          eta.notes,
          eta.assigned_at,
          p.name as person_name,
          p.email as person_email,
          p.photo_url as person_photo_url,
          ea.status as attendance_status,
          COALESCE(er.cancelled_late, 0) as cancelled_late
        FROM event_team_assignments eta
        JOIN people p ON p.id = eta.person_id
        LEFT JOIN event_attendance ea ON ea.event_id = eta.event_id AND ea.person_id = eta.person_id
        LEFT JOIN event_rsvps er ON er.event_id = eta.event_id AND er.person_id = eta.person_id
        WHERE eta.event_id = ?
        ORDER BY eta.position_code, p.name
      `)
      .bind(eventId)
      .all<TeamAssignment>()

    // Get RSVPs who said yes (potential players to assign)
    const rsvps = await db
      .prepare(`
        SELECT
          er.person_id,
          er.response,
          p.name as person_name,
          p.email as person_email,
          p.photo_url as person_photo_url
        FROM event_rsvps er
        JOIN people p ON p.id = er.person_id
        WHERE er.event_id = ? AND er.response = 'yes'
        ORDER BY p.name
      `)
      .bind(eventId)
      .all()

    // Build response with teams and their assignments
    const teamsWithAssignments: TeamWithAssignments[] = teams.results.map(team => ({
      ...team,
      assignments: assignments.results.filter(a => a.team_id === team.id),
    }))

    // Unassigned players (have assignment but no team)
    const unassigned = assignments.results.filter(a => !a.team_id)

    // Players who RSVP'd yes but have no assignment yet
    const assignedPersonIds = new Set(assignments.results.map(a => a.person_id))
    const unassignedRsvps = rsvps.results.filter(r => !assignedPersonIds.has(r.person_id))

    return jsonResponse({
      event: {
        id: event.id,
        title: event.title,
        starts_at_utc: event.starts_at_utc,
      },
      teams: teamsWithAssignments,
      unassigned,
      available_players: unassignedRsvps,
      total_assigned: assignments.results.length,
      total_rsvp_yes: rsvps.results.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/events/[id]/teams
 * Create or update teams for an event (admin only)
 *
 * Body: { teams: [{ id?, name, sort_order }], club_id }
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      teams: Array<{ id?: string; name: string; sort_order?: number }>
    }

    const { club_id, teams } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
    }

    // Get person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, person.id, club_id)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Verify event exists
    const event = await db
      .prepare('SELECT id FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, club_id)
      .first()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Process teams
    const results: EventTeam[] = []

    for (let i = 0; i < teams.length; i++) {
      const team = teams[i]
      const sortOrder = team.sort_order ?? i

      if (team.id) {
        // Update existing team
        await db
          .prepare('UPDATE event_teams SET name = ?, sort_order = ? WHERE id = ? AND event_id = ?')
          .bind(team.name, sortOrder, team.id, eventId)
          .run()

        const updated = await db
          .prepare('SELECT * FROM event_teams WHERE id = ?')
          .bind(team.id)
          .first<EventTeam>()

        if (updated) results.push(updated)
      } else {
        // Create new team
        const teamId = crypto.randomUUID()
        await db
          .prepare(`
            INSERT INTO event_teams (id, event_id, name, sort_order, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `)
          .bind(teamId, eventId, team.name, sortOrder)
          .run()

        const created = await db
          .prepare('SELECT * FROM event_teams WHERE id = ?')
          .bind(teamId)
          .first<EventTeam>()

        if (created) results.push(created)
      }
    }

    return jsonResponse({ teams: results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
