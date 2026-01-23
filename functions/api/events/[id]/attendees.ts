/**
 * Event Attendees Endpoint
 * GET /api/events/:id/attendees - Get list of RSVPs for an event
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'

interface Attendee {
  person_id: string
  name: string
  photo_url: string | null
  response: 'yes' | 'no' | 'maybe'
  responded_at: string
}

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const eventId = context.params.id as string

  if (!eventId) {
    return errorResponse('Event ID is required', 400)
  }

  try {
    // Get user's person ID
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Get event details to verify club membership
    const event = await db
      .prepare('SELECT id, club_id FROM events WHERE id = ?')
      .bind(eventId)
      .first<{ id: string; club_id: string }>()

    if (!event) {
      return errorResponse('Event not found', 404)
    }

    // Verify user is a member of the event's club
    const membership = await db
      .prepare(`
        SELECT id FROM club_memberships
        WHERE club_id = ? AND person_id = ? AND status = 'active'
      `)
      .bind(event.club_id, person.id)
      .first()

    if (!membership) {
      return errorResponse('Not a member of this club', 403)
    }

    // Get all RSVPs for this event
    const attendees = await db
      .prepare(`
        SELECT
          er.person_id,
          p.name,
          p.photo_url,
          er.response,
          er.responded_at
        FROM event_rsvps er
        JOIN people p ON p.id = er.person_id
        WHERE er.event_id = ?
        ORDER BY
          CASE er.response
            WHEN 'yes' THEN 1
            WHEN 'maybe' THEN 2
            WHEN 'no' THEN 3
          END,
          p.name
      `)
      .bind(eventId)
      .all<Attendee>()

    // Separate by response type
    const yes = attendees.results?.filter(a => a.response === 'yes') || []
    const maybe = attendees.results?.filter(a => a.response === 'maybe') || []
    const no = attendees.results?.filter(a => a.response === 'no') || []

    return jsonResponse({
      attendees: {
        yes,
        maybe,
        no,
      },
      counts: {
        yes: yes.length,
        maybe: maybe.length,
        no: no.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
