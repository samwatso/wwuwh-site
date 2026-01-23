/**
 * Admin Event Series Invitations Endpoint
 * GET    /api/admin/event-series/:id/invitations - List invitations
 * POST   /api/admin/event-series/:id/invitations - Add invitations
 * DELETE /api/admin/event-series/:id/invitations - Remove invitation
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface PersonInvitation {
  id: string
  person_id: string
  name: string
  email: string
  created_at: string
}

interface GroupInvitation {
  id: string
  group_id: string
  name: string
  kind: string
  member_count: number
  created_at: string
}

/**
 * GET /api/admin/event-series/:id/invitations
 * List all invitations for a series
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get admin person record
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, person.id, clubId)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Verify series exists and belongs to club
    const series = await db
      .prepare('SELECT id FROM event_series WHERE id = ? AND club_id = ?')
      .bind(seriesId, clubId)
      .first()

    if (!series) {
      return errorResponse('Series not found', 404)
    }

    // Get person invitations
    const personInvitations = await db
      .prepare(`
        SELECT
          si.id,
          si.person_id,
          p.name,
          p.email,
          si.created_at
        FROM series_invitations si
        JOIN people p ON p.id = si.person_id
        WHERE si.series_id = ? AND si.person_id IS NOT NULL
        ORDER BY p.name
      `)
      .bind(seriesId)
      .all<PersonInvitation>()

    // Get group invitations with member counts
    const groupInvitations = await db
      .prepare(`
        SELECT
          si.id,
          si.group_id,
          g.name,
          g.kind,
          (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
          si.created_at
        FROM series_invitations si
        JOIN groups g ON g.id = si.group_id
        WHERE si.series_id = ? AND si.group_id IS NOT NULL
        ORDER BY g.name
      `)
      .bind(seriesId)
      .all<GroupInvitation>()

    return jsonResponse({
      invitations: {
        persons: personInvitations.results || [],
        groups: groupInvitations.results || [],
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/admin/event-series/:id/invitations
 * Add invitations to a series (and optionally propagate to existing future events)
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      person_ids?: string[]
      group_ids?: string[]
      propagate_to_existing?: boolean
    }

    const { club_id, person_ids, group_ids, propagate_to_existing = true } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
    }

    if ((!person_ids || person_ids.length === 0) && (!group_ids || group_ids.length === 0)) {
      return errorResponse('At least one person_id or group_id is required', 400)
    }

    // Get admin person record
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

    // Verify series exists and belongs to club
    const series = await db
      .prepare('SELECT id FROM event_series WHERE id = ? AND club_id = ?')
      .bind(seriesId, club_id)
      .first()

    if (!series) {
      return errorResponse('Series not found', 404)
    }

    let personsAdded = 0
    let groupsAdded = 0

    // Add person invitations to series
    if (person_ids && person_ids.length > 0) {
      for (const personId of person_ids) {
        try {
          await db
            .prepare(`
              INSERT INTO series_invitations (id, series_id, person_id, invited_by_person_id, created_at)
              VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
            `)
            .bind(seriesId, personId, person.id)
            .run()
          personsAdded++

          // Propagate to existing future events
          if (propagate_to_existing) {
            const now = new Date().toISOString()
            await db
              .prepare(`
                INSERT OR IGNORE INTO event_invitations (id, event_id, person_id, invited_by_person_id, created_at)
                SELECT lower(hex(randomblob(16))), e.id, ?, ?, datetime('now')
                FROM events e
                WHERE e.series_id = ? AND e.starts_at_utc > ? AND e.status = 'scheduled'
              `)
              .bind(personId, person.id, seriesId, now)
              .run()
          }
        } catch (e) {
          const err = e as Error
          if (!err.message?.includes('UNIQUE constraint')) {
            throw e
          }
        }
      }
    }

    // Add group invitations to series
    if (group_ids && group_ids.length > 0) {
      for (const groupId of group_ids) {
        try {
          await db
            .prepare(`
              INSERT INTO series_invitations (id, series_id, group_id, invited_by_person_id, created_at)
              VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
            `)
            .bind(seriesId, groupId, person.id)
            .run()
          groupsAdded++

          // Propagate to existing future events
          if (propagate_to_existing) {
            const now = new Date().toISOString()
            await db
              .prepare(`
                INSERT OR IGNORE INTO event_invitations (id, event_id, group_id, invited_by_person_id, created_at)
                SELECT lower(hex(randomblob(16))), e.id, ?, ?, datetime('now')
                FROM events e
                WHERE e.series_id = ? AND e.starts_at_utc > ? AND e.status = 'scheduled'
              `)
              .bind(groupId, person.id, seriesId, now)
              .run()
          }
        } catch (e) {
          const err = e as Error
          if (!err.message?.includes('UNIQUE constraint')) {
            throw e
          }
        }
      }
    }

    return jsonResponse({
      success: true,
      added: { persons: personsAdded, groups: groupsAdded },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/event-series/:id/invitations
 * Remove an invitation from a series
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const seriesId = context.params.id as string
  const url = new URL(context.request.url)
  const force = url.searchParams.get('force') === 'true'

  try {
    const body = await context.request.json() as {
      club_id: string
      invitation_id?: string
      person_id?: string
      group_id?: string
      propagate_to_existing?: boolean
    }

    const { club_id, invitation_id, person_id, group_id, propagate_to_existing = true } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
    }

    if (!invitation_id && !person_id && !group_id) {
      return errorResponse('invitation_id, person_id, or group_id is required', 400)
    }

    // Get admin person record
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

    const now = new Date().toISOString()

    // Check for RSVPs in future events before removing
    if (!force && propagate_to_existing) {
      if (person_id || invitation_id) {
        let targetPersonId = person_id

        if (invitation_id && !targetPersonId) {
          const inv = await db
            .prepare('SELECT person_id FROM series_invitations WHERE id = ?')
            .bind(invitation_id)
            .first<{ person_id: string | null }>()
          targetPersonId = inv?.person_id || undefined
        }

        if (targetPersonId) {
          const rsvps = await db
            .prepare(`
              SELECT e.id, e.title, e.starts_at_utc, er.response
              FROM events e
              JOIN event_rsvps er ON er.event_id = e.id AND er.person_id = ?
              WHERE e.series_id = ? AND e.starts_at_utc > ? AND e.status = 'scheduled'
            `)
            .bind(targetPersonId, seriesId, now)
            .all<{ id: string; title: string; starts_at_utc: string; response: string }>()

          if (rsvps.results && rsvps.results.length > 0) {
            const targetPerson = await db
              .prepare('SELECT name FROM people WHERE id = ?')
              .bind(targetPersonId)
              .first<{ name: string }>()

            return jsonResponse({
              success: false,
              warning: `Cannot remove invitation: ${targetPerson?.name || 'Member'} has responded to ${rsvps.results.length} upcoming event(s) in this series.`,
              events_with_rsvp: rsvps.results,
            }, 409)
          }
        }
      }

      if (group_id) {
        const membersWithRsvp = await db
          .prepare(`
            SELECT DISTINCT p.name, e.title, er.response
            FROM group_members gm
            JOIN people p ON p.id = gm.person_id
            JOIN events e ON e.series_id = ? AND e.starts_at_utc > ? AND e.status = 'scheduled'
            JOIN event_rsvps er ON er.event_id = e.id AND er.person_id = gm.person_id
            WHERE gm.group_id = ?
            LIMIT 10
          `)
          .bind(seriesId, now, group_id)
          .all<{ name: string; title: string; response: string }>()

        if (membersWithRsvp.results && membersWithRsvp.results.length > 0) {
          return jsonResponse({
            success: false,
            warning: `Cannot remove group: ${membersWithRsvp.results.length} member(s) have responded to upcoming events in this series.`,
            members_with_rsvp: membersWithRsvp.results,
          }, 409)
        }
      }
    }

    // Delete the series invitation
    if (invitation_id) {
      await db
        .prepare('DELETE FROM series_invitations WHERE id = ? AND series_id = ?')
        .bind(invitation_id, seriesId)
        .run()
    } else if (person_id) {
      await db
        .prepare('DELETE FROM series_invitations WHERE series_id = ? AND person_id = ?')
        .bind(seriesId, person_id)
        .run()

      // Propagate to future events
      if (propagate_to_existing) {
        await db
          .prepare(`
            DELETE FROM event_invitations
            WHERE person_id = ? AND event_id IN (
              SELECT id FROM events WHERE series_id = ? AND starts_at_utc > ? AND status = 'scheduled'
            )
          `)
          .bind(person_id, seriesId, now)
          .run()
      }
    } else if (group_id) {
      await db
        .prepare('DELETE FROM series_invitations WHERE series_id = ? AND group_id = ?')
        .bind(seriesId, group_id)
        .run()

      // Propagate to future events
      if (propagate_to_existing) {
        await db
          .prepare(`
            DELETE FROM event_invitations
            WHERE group_id = ? AND event_id IN (
              SELECT id FROM events WHERE series_id = ? AND starts_at_utc > ? AND status = 'scheduled'
            )
          `)
          .bind(group_id, seriesId, now)
          .run()
      }
    }

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
