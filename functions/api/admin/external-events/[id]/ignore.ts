/**
 * Ignore External Event Endpoint
 * POST /api/admin/external-events/:id/ignore - Mark an external event as ignored
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface IgnoreBody {
  club_id: string
}

/**
 * POST /api/admin/external-events/:id/ignore
 * Marks an external event as ignored for this club
 *
 * Idempotent: if already ignored, returns success
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const externalEventId = context.params.id as string

  try {
    const body = await context.request.json() as IgnoreBody
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
      .prepare('SELECT id FROM external_events WHERE id = ?')
      .bind(externalEventId)
      .first<{ id: string }>()

    if (!externalEvent) {
      return errorResponse('External event not found', 404)
    }

    // Check if already linked for this club
    const existingLink = await db
      .prepare(`
        SELECT decision, linked_event_id
        FROM external_event_links
        WHERE external_event_id = ? AND club_id = ?
      `)
      .bind(externalEventId, club_id)
      .first<{ decision: string; linked_event_id: string | null }>()

    // If already ignored, return success (idempotent)
    if (existingLink?.decision === 'ignored') {
      return jsonResponse({
        success: true,
        already_ignored: true,
      })
    }

    // If promoted with a linked event, don't allow ignore (must undo first)
    if (existingLink?.decision === 'promoted' && existingLink.linked_event_id) {
      return errorResponse('Cannot ignore a promoted event. Use undo first.', 400)
    }

    // Create or update the link record
    if (existingLink) {
      // Update existing link
      await db
        .prepare(`
          UPDATE external_event_links
          SET decision = 'ignored',
              linked_event_id = NULL,
              decided_by_person_id = ?,
              decided_at = datetime('now')
          WHERE external_event_id = ? AND club_id = ?
        `)
        .bind(person.id, externalEventId, club_id)
        .run()
    } else {
      // Create new link
      await db
        .prepare(`
          INSERT INTO external_event_links (
            external_event_id, club_id, decision, linked_event_id,
            decided_by_person_id, decided_at
          )
          VALUES (?, ?, 'ignored', NULL, ?, datetime('now'))
        `)
        .bind(externalEventId, club_id, person.id)
        .run()
    }

    return jsonResponse({
      success: true,
      already_ignored: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
