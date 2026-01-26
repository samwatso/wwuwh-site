/**
 * Admin Event Invitations Endpoint
 * GET    /api/admin/events/:id/invitations - List invitations
 * POST   /api/admin/events/:id/invitations - Add invitations
 * DELETE /api/admin/events/:id/invitations - Remove invitation
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'
import { sendEventInvitationNotification } from '../../../../lib/apns'

interface PersonInvitation {
  id: string
  person_id: string
  name: string
  email: string
  rsvp_response: 'yes' | 'no' | 'maybe' | null
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
 * GET /api/admin/events/:id/invitations
 * List all invitations for an event
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

    // Verify event exists and belongs to club
    const event = await db
      .prepare('SELECT id FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, clubId)
      .first()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Get person invitations with RSVP status
    const personInvitations = await db
      .prepare(`
        SELECT
          ei.id,
          ei.person_id,
          p.name,
          p.email,
          er.response as rsvp_response,
          ei.created_at
        FROM event_invitations ei
        JOIN people p ON p.id = ei.person_id
        LEFT JOIN event_rsvps er ON er.event_id = ei.event_id AND er.person_id = ei.person_id
        WHERE ei.event_id = ? AND ei.person_id IS NOT NULL
        ORDER BY p.name
      `)
      .bind(eventId)
      .all<PersonInvitation>()

    // Get group invitations with member counts
    const groupInvitations = await db
      .prepare(`
        SELECT
          ei.id,
          ei.group_id,
          g.name,
          g.kind,
          (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
          ei.created_at
        FROM event_invitations ei
        JOIN groups g ON g.id = ei.group_id
        WHERE ei.event_id = ? AND ei.group_id IS NOT NULL
        ORDER BY g.name
      `)
      .bind(eventId)
      .all<GroupInvitation>()

    // Calculate total unique invited persons
    const totalResult = await db
      .prepare(`
        SELECT COUNT(DISTINCT person_id) as total FROM (
          -- Direct person invitations
          SELECT person_id FROM event_invitations WHERE event_id = ? AND person_id IS NOT NULL
          UNION
          -- Group members from invited groups
          SELECT gm.person_id
          FROM event_invitations ei
          JOIN group_members gm ON gm.group_id = ei.group_id
          WHERE ei.event_id = ? AND ei.group_id IS NOT NULL
        )
      `)
      .bind(eventId, eventId)
      .first<{ total: number }>()

    return jsonResponse({
      invitations: {
        persons: personInvitations.results || [],
        groups: groupInvitations.results || [],
      },
      total_invited: totalResult?.total || 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/admin/events/:id/invitations
 * Add invitations to an event
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      person_ids?: string[]
      group_ids?: string[]
    }

    const { club_id, person_ids, group_ids } = body

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

    // Verify event exists and belongs to club
    const event = await db
      .prepare('SELECT id, title FROM events WHERE id = ? AND club_id = ?')
      .bind(eventId, club_id)
      .first<{ id: string; title: string }>()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    let personsAdded = 0
    let groupsAdded = 0

    // Add person invitations
    if (person_ids && person_ids.length > 0) {
      for (const personId of person_ids) {
        try {
          await db
            .prepare(`
              INSERT INTO event_invitations (id, event_id, person_id, invited_by_person_id, created_at)
              VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
            `)
            .bind(eventId, personId, person.id)
            .run()
          personsAdded++
        } catch (e) {
          // Ignore duplicate constraint errors
          const err = e as Error
          if (!err.message?.includes('UNIQUE constraint')) {
            throw e
          }
        }
      }
    }

    // Add group invitations
    if (group_ids && group_ids.length > 0) {
      for (const groupId of group_ids) {
        try {
          await db
            .prepare(`
              INSERT INTO event_invitations (id, event_id, group_id, invited_by_person_id, created_at)
              VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
            `)
            .bind(eventId, groupId, person.id)
            .run()
          groupsAdded++
        } catch (e) {
          // Ignore duplicate constraint errors
          const err = e as Error
          if (!err.message?.includes('UNIQUE constraint')) {
            throw e
          }
        }
      }
    }

    // Send push notifications to newly invited people
    const allInvitedPersonIds: string[] = []

    // Add directly invited person IDs
    if (person_ids && person_ids.length > 0) {
      allInvitedPersonIds.push(...person_ids)
    }

    // Add person IDs from invited groups
    if (group_ids && group_ids.length > 0) {
      const groupPlaceholders = group_ids.map(() => '?').join(',')
      const groupMembers = await db
        .prepare(`
          SELECT DISTINCT person_id FROM group_members
          WHERE group_id IN (${groupPlaceholders})
        `)
        .bind(...group_ids)
        .all<{ person_id: string }>()

      if (groupMembers.results) {
        allInvitedPersonIds.push(...groupMembers.results.map(m => m.person_id))
      }
    }

    // Send notifications asynchronously (don't block the response)
    if (allInvitedPersonIds.length > 0) {
      // Use waitUntil to send notifications in background
      context.waitUntil(
        sendEventInvitationNotification(
          context.env,
          db,
          eventId,
          event.title,
          [...new Set(allInvitedPersonIds)] // Deduplicate
        )
      )
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
 * DELETE /api/admin/events/:id/invitations
 * Remove an invitation from an event
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string
  const url = new URL(context.request.url)
  const force = url.searchParams.get('force') === 'true'

  try {
    const body = await context.request.json() as {
      club_id: string
      invitation_id?: string
      person_id?: string
      group_id?: string
    }

    const { club_id, invitation_id, person_id, group_id } = body

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

    // If removing a person invitation, check for RSVP
    if ((person_id || invitation_id) && !force) {
      let targetPersonId = person_id

      // If we have invitation_id, look up the person_id
      if (invitation_id && !targetPersonId) {
        const inv = await db
          .prepare('SELECT person_id FROM event_invitations WHERE id = ?')
          .bind(invitation_id)
          .first<{ person_id: string | null }>()
        targetPersonId = inv?.person_id || undefined
      }

      if (targetPersonId) {
        const rsvp = await db
          .prepare('SELECT response FROM event_rsvps WHERE event_id = ? AND person_id = ?')
          .bind(eventId, targetPersonId)
          .first<{ response: string }>()

        if (rsvp) {
          // Get person name for message
          const targetPerson = await db
            .prepare('SELECT name FROM people WHERE id = ?')
            .bind(targetPersonId)
            .first<{ name: string }>()

          return jsonResponse({
            success: false,
            warning: `Cannot remove invitation: ${targetPerson?.name || 'Member'} has already responded "${rsvp.response}" to this event.`,
            rsvp_response: rsvp.response,
          }, 409)
        }
      }
    }

    // If removing a group invitation, check for RSVPs from group members
    if (group_id && !force) {
      const membersWithRsvp = await db
        .prepare(`
          SELECT p.name, er.response
          FROM group_members gm
          JOIN people p ON p.id = gm.person_id
          JOIN event_rsvps er ON er.person_id = gm.person_id AND er.event_id = ?
          WHERE gm.group_id = ?
        `)
        .bind(eventId, group_id)
        .all<{ name: string; response: string }>()

      if (membersWithRsvp.results && membersWithRsvp.results.length > 0) {
        return jsonResponse({
          success: false,
          warning: `Cannot remove group: ${membersWithRsvp.results.length} member(s) have already responded to this event.`,
          members_with_rsvp: membersWithRsvp.results,
        }, 409)
      }
    }

    // Delete the invitation
    if (invitation_id) {
      await db
        .prepare('DELETE FROM event_invitations WHERE id = ? AND event_id = ?')
        .bind(invitation_id, eventId)
        .run()
    } else if (person_id) {
      await db
        .prepare('DELETE FROM event_invitations WHERE event_id = ? AND person_id = ?')
        .bind(eventId, person_id)
        .run()
    } else if (group_id) {
      await db
        .prepare('DELETE FROM event_invitations WHERE event_id = ? AND group_id = ?')
        .bind(eventId, group_id)
        .run()
    }

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
