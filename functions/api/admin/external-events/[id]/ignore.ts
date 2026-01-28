/**
 * Ignore External Event Endpoint
 * POST /api/admin/external-events/:id/ignore - Mark an external event as ignored
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAnyPermission, PermissionContext } from '../../../../middleware/permission'
import { PERMISSIONS } from '../../../../lib/permissions'

/**
 * POST /api/admin/external-events/:id/ignore
 * Marks an external event as ignored for this club
 *
 * Idempotent: if already ignored, returns success
 * Requires: events.create OR events.edit permission
 */
export const onRequestPost: PagesFunction<Env> = withAnyPermission([
  PERMISSIONS.EVENTS_CREATE,
  PERMISSIONS.EVENTS_EDIT,
])(async (context, auth: PermissionContext) => {
  const db = context.env.WWUWH_DB
  const externalEventId = context.params.id as string
  const { clubId } = auth

  try {
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
        SELECT id, decision, event_id
        FROM external_event_links
        WHERE external_event_id = ? AND club_id = ?
      `)
      .bind(externalEventId, clubId)
      .first<{ id: string; decision: string; event_id: string | null }>()

    // If already ignored, return success (idempotent)
    if (existingLink?.decision === 'ignored') {
      return jsonResponse({
        success: true,
        already_ignored: true,
      })
    }

    // If promoted with a linked event, don't allow ignore (must undo first)
    if (existingLink?.decision === 'promoted' && existingLink.event_id) {
      return errorResponse('Cannot ignore a promoted event. Use undo first.', 400)
    }

    // Create or update the link record
    if (existingLink) {
      // Update existing link
      await db
        .prepare(`
          UPDATE external_event_links
          SET decision = 'ignored',
              event_id = NULL,
              decided_by_person_id = ?,
              decided_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(auth.person.id, existingLink.id)
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
          VALUES (?, ?, ?, 'ignored', NULL, ?, datetime('now'))
        `)
        .bind(linkId, clubId, externalEventId, auth.person.id)
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
