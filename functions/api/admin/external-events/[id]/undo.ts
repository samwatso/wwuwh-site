/**
 * Undo External Event Decision Endpoint
 * POST /api/admin/external-events/:id/undo - Remove decision (promote/ignore) from external event
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAnyPermission, PermissionContext } from '../../../../middleware/permission'
import { PERMISSIONS } from '../../../../lib/permissions'

/**
 * POST /api/admin/external-events/:id/undo
 * Removes the decision for an external event
 *
 * If was promoted:
 * - Deletes the linked club event (if no RSVPs exist)
 * - Removes the link record
 *
 * If was ignored:
 * - Removes the link record
 *
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
    // Check if link exists
    const existingLink = await db
      .prepare(`
        SELECT id, decision, event_id
        FROM external_event_links
        WHERE external_event_id = ? AND club_id = ?
      `)
      .bind(externalEventId, clubId)
      .first<{ id: string; decision: string; event_id: string | null }>()

    if (!existingLink || existingLink.decision === 'undecided') {
      // No decision to undo, return success (idempotent)
      return jsonResponse({
        success: true,
        had_decision: false,
      })
    }

    // If was promoted with a linked event, check for RSVPs before deleting
    if (existingLink.decision === 'promoted' && existingLink.event_id) {
      const rsvpCount = await db
        .prepare(`
          SELECT COUNT(*) as count
          FROM event_rsvps
          WHERE event_id = ?
        `)
        .bind(existingLink.event_id)
        .first<{ count: number }>()

      if (rsvpCount && rsvpCount.count > 0) {
        return errorResponse(
          'Cannot undo: the promoted event has RSVPs. Delete the event manually first.',
          400
        )
      }

      // Delete the linked event (no RSVPs exist)
      await db
        .prepare('DELETE FROM events WHERE id = ?')
        .bind(existingLink.event_id)
        .run()
    }

    // Reset the link record to undecided
    await db
      .prepare(`
        UPDATE external_event_links
        SET decision = 'undecided',
            event_id = NULL,
            decided_by_person_id = NULL,
            decided_at = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `)
      .bind(existingLink.id)
      .run()

    return jsonResponse({
      success: true,
      had_decision: true,
      previous_decision: existingLink.decision,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
