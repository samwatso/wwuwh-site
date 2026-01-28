/**
 * Admin Groups Endpoint
 * GET  /api/admin/groups - List all groups
 * POST /api/admin/groups - Create a new group
 *
 * Requires: teams.assign permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'

interface Group {
  id: string
  club_id: string
  name: string
  kind: 'team' | 'committee' | 'squad' | 'other'
  description: string | null
  created_at: string
  archived_at: string | null
  member_count?: number
}

/**
 * GET /api/admin/groups
 * List all groups for a club with member counts
 * Requires: teams.assign permission
 */
export const onRequestGet: PagesFunction<Env> = withPermission(PERMISSIONS.TEAMS_ASSIGN)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const url = new URL(context.request.url)
    const includeArchived = url.searchParams.get('include_archived') === 'true'

    try {
        // Build archived filter
      const archivedFilter = includeArchived ? '' : 'AND g.archived_at IS NULL'

      // Fetch all groups with member counts
      const groups = await db
        .prepare(`
          SELECT g.*,
                 (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
          FROM groups g
          WHERE g.club_id = ?
            ${archivedFilter}
          ORDER BY g.kind, g.name
        `)
        .bind(auth.clubId)
        .all<Group>()

      return jsonResponse({
        groups: groups.results,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database error'
      return errorResponse(message, 500)
    }
  }
)

/**
 * POST /api/admin/groups
 * Create a new group
 * Requires: teams.assign permission
 */
export const onRequestPost: PagesFunction<Env> = withPermission(PERMISSIONS.TEAMS_ASSIGN)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB

    try {
      const body = await context.request.json() as {
        club_id: string
        name: string
        kind?: 'team' | 'committee' | 'squad' | 'other'
        description?: string
      }

      const { name } = body

      if (!name) {
        return errorResponse('name is required', 400)
      }

      // Check for duplicate name
      const existing = await db
        .prepare('SELECT id FROM groups WHERE club_id = ? AND name = ? AND archived_at IS NULL')
        .bind(auth.clubId, name)
        .first()

    if (existing) {
      return errorResponse('A group with this name already exists', 409)
    }

    // Generate group ID
    const groupId = crypto.randomUUID()

      // Create group
      await db
        .prepare(`
          INSERT INTO groups (id, club_id, name, kind, description, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `)
        .bind(
          groupId,
          auth.clubId,
          name,
          body.kind || 'team',
          body.description || null
        )
        .run()

      // Fetch the created group
      const group = await db
        .prepare('SELECT * FROM groups WHERE id = ?')
        .bind(groupId)
        .first<Group>()

      return jsonResponse({ group })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database error'
      return errorResponse(message, 500)
    }
  }
)
