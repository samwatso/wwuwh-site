/**
 * Team Assignments Endpoint
 * POST /api/events/[id]/teams/assignments - Update player assignments (admin)
 * DELETE /api/events/[id]/teams/assignments - Remove assignment (admin)
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'
import { checkAndGrantAwards } from '../../../../lib/awards-service'

interface AssignmentUpdate {
  person_id: string
  team_id: string | null
  activity: 'play' | 'swim_sets' | 'not_playing' | 'other'
  position_code?: 'F' | 'W' | 'C' | 'B' | null
  notes?: string | null
  attendance_status?: 'present' | 'absent' | 'late' | 'excused' | null
}

/**
 * POST /api/events/[id]/teams/assignments
 * Create or update player assignments (admin only)
 *
 * Body: { club_id, assignments: AssignmentUpdate[] }
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      assignments: AssignmentUpdate[]
    }

    const { club_id, assignments } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
    }

    if (!assignments || !Array.isArray(assignments)) {
      return errorResponse('assignments array is required', 400)
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

    // Verify event exists and get details for awards
    const event = await db
      .prepare('SELECT id, kind, starts_at_utc FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, club_id)
      .first<{ id: string; kind: string; starts_at_utc: string }>()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Process assignments using upsert
    const results = []

    for (const assignment of assignments) {
      const { person_id, team_id, activity, position_code, notes, attendance_status } = assignment

      // Validate person exists
      const personExists = await db
        .prepare('SELECT id FROM people WHERE id = ?')
        .bind(person_id)
        .first()

      if (!personExists) {
        continue // Skip invalid person IDs
      }

      // If team_id provided, validate it exists for this event
      if (team_id) {
        const teamExists = await db
          .prepare('SELECT id FROM event_teams WHERE id = ? AND event_id = ?')
          .bind(team_id, eventId)
          .first()

        if (!teamExists) {
          continue // Skip invalid team IDs
        }
      }

      // Upsert assignment
      await db
        .prepare(`
          INSERT INTO event_team_assignments (
            event_id, person_id, team_id, activity, position_code, notes,
            assigned_at, assigned_by_person_id
          )
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
          ON CONFLICT(event_id, person_id) DO UPDATE SET
            team_id = excluded.team_id,
            activity = excluded.activity,
            position_code = excluded.position_code,
            notes = excluded.notes,
            assigned_at = excluded.assigned_at,
            assigned_by_person_id = excluded.assigned_by_person_id
        `)
        .bind(
          eventId,
          person_id,
          team_id,
          activity || 'play',
          position_code || null,
          notes || null,
          person.id
        )
        .run()

      // Handle attendance status if provided
      if (attendance_status !== undefined) {
        if (attendance_status === null) {
          // Remove attendance record
          await db
            .prepare('DELETE FROM event_attendance WHERE event_id = ? AND person_id = ?')
            .bind(eventId, person_id)
            .run()
        } else {
          // Upsert attendance record
          await db
            .prepare(`
              INSERT INTO event_attendance (event_id, person_id, status, checked_in_at)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(event_id, person_id) DO UPDATE SET
                status = excluded.status,
                checked_in_at = datetime('now')
            `)
            .bind(eventId, person_id, attendance_status)
            .run()

          // Check attendance awards if marked present/late
          if (attendance_status === 'present' || attendance_status === 'late') {
            await checkAndGrantAwards(context.env, db, person_id, 'attendance', {
              eventId,
              status: attendance_status,
              eventKind: event.kind,
              eventStartsAt: event.starts_at_utc,
            })
          }
        }
      }

      // Check team assignment awards if assigned to a team with 'play' activity
      if (team_id && (activity === 'play' || !activity)) {
        // Get team name for context
        const team = await db
          .prepare('SELECT name FROM event_teams WHERE id = ?')
          .bind(team_id)
          .first<{ name: string }>()

        await checkAndGrantAwards(context.env, db, person_id, 'team_assigned', {
          eventId,
          teamId: team_id,
          teamName: team?.name,
          positionCode: position_code || null,
          activity: activity || 'play',
        })
      }

      results.push({
        person_id,
        team_id,
        activity: activity || 'play',
        position_code: position_code || null,
        attendance_status: attendance_status ?? null,
      })
    }

    return jsonResponse({
      success: true,
      updated: results.length,
      assignments: results as Array<{
        person_id: string
        team_id: string | null
        activity: string
        position_code: string | null
        attendance_status: string | null
      }>,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/events/[id]/teams/assignments
 * Remove a player assignment (admin only)
 *
 * Body: { club_id, person_id }
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      person_id: string
    }

    const { club_id, person_id } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
    }

    if (!person_id) {
      return errorResponse('person_id is required', 400)
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

    // Delete assignment
    await db
      .prepare('DELETE FROM event_team_assignments WHERE event_id = ? AND person_id = ?')
      .bind(eventId, person_id)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
