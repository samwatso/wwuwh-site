/**
 * Promote External Event Endpoint
 * POST /api/admin/external-events/:id/promote - Create a club event from an external event
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface PromoteBody {
  club_id: string
  // Optional overrides for the promoted event
  title?: string
  description?: string
  location?: string
  capacity?: number
  visible_from?: string
}

/**
 * POST /api/admin/external-events/:id/promote
 * Creates a new club event from the external event data
 *
 * Idempotent: if already promoted, returns the existing linked event
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const externalEventId = context.params.id as string

  try {
    const body = await context.request.json() as PromoteBody
    const { club_id } = body

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

    // Check if external event exists
    const externalEvent = await db
      .prepare(`
        SELECT id, title, description, location, starts_at_utc, ends_at_utc
        FROM external_events
        WHERE id = ?
      `)
      .bind(externalEventId)
      .first<{
        id: string
        title: string
        description: string | null
        location: string | null
        starts_at_utc: string
        ends_at_utc: string | null
      }>()

    if (!externalEvent) {
      return errorResponse('External event not found', 404)
    }

    // Check if already linked for this club
    const existingLink = await db
      .prepare(`
        SELECT id, decision, event_id
        FROM external_event_links
        WHERE external_event_id = ? AND club_id = ?
      `)
      .bind(externalEventId, club_id)
      .first<{ id: string; decision: string; event_id: string | null }>()

    // If already promoted, return the existing event (idempotent)
    if (existingLink?.decision === 'promoted' && existingLink.event_id) {
      const existingEvent = await db
        .prepare('SELECT * FROM events WHERE id = ?')
        .bind(existingLink.event_id)
        .first()

      return jsonResponse({
        event: existingEvent,
        already_promoted: true,
      })
    }

    // Generate new event ID
    const eventId = crypto.randomUUID()

    // Calculate default visible_from (5 days before event)
    const eventDate = new Date(externalEvent.starts_at_utc)
    const defaultVisibleFrom = new Date(eventDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const visibleFrom = body.visible_from || defaultVisibleFrom

    // Calculate default ends_at if not provided (2 hours after start)
    const defaultEndsAt = externalEvent.ends_at_utc ||
      new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString()

    // Create the club event
    await db
      .prepare(`
        INSERT INTO events (
          id, club_id, title, description, location, kind,
          starts_at_utc, ends_at_utc, timezone, capacity,
          payment_mode, visible_from, external_source,
          created_by_person_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'tournament', ?, ?, 'Europe/London', ?, 'free', ?, 'boa', ?, datetime('now'), datetime('now'))
      `)
      .bind(
        eventId,
        club_id,
        body.title || externalEvent.title,
        body.description || externalEvent.description || null,
        body.location || externalEvent.location || null,
        externalEvent.starts_at_utc,
        defaultEndsAt,
        body.capacity || null,
        visibleFrom,
        person.id
      )
      .run()

    // Create or update the link record
    if (existingLink) {
      // Update existing link (was ignored/undecided, now promoting)
      await db
        .prepare(`
          UPDATE external_event_links
          SET decision = 'promoted',
              event_id = ?,
              decided_by_person_id = ?,
              decided_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(eventId, person.id, existingLink.id)
        .run()
    } else {
      // Create new link
      const linkId = crypto.randomUUID()
      await db
        .prepare(`
          INSERT INTO external_event_links (
            id, club_id, external_event_id, decision, event_id,
            decided_by_person_id, decided_at
          )
          VALUES (?, ?, ?, 'promoted', ?, ?, datetime('now'))
        `)
        .bind(linkId, club_id, externalEventId, eventId, person.id)
        .run()
    }

    // Fetch the created event
    const event = await db
      .prepare('SELECT * FROM events WHERE id = ?')
      .bind(eventId)
      .first()

    return jsonResponse({
      event,
      already_promoted: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
