/**
 * Admin Group Detail Endpoint
 * GET    /api/admin/groups/:id - Get group details with members
 * PUT    /api/admin/groups/:id - Update group
 * DELETE /api/admin/groups/:id - Archive/delete group
 *
 * Requires: teams.assign permission
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withPermission, PermissionContext } from '../../../middleware/permission'
import { PERMISSIONS } from '../../../lib/permissions'

interface GroupMember {
  person_id: string
  name: string
  email: string
  group_role: 'member' | 'coach' | 'captain' | 'admin'
  added_at: string
}

/**
 * GET /api/admin/groups/:id
 * Get group details with members
 * Requires: teams.assign permission
 */
export const onRequestGet: PagesFunction<Env> = withPermission(PERMISSIONS.TEAMS_ASSIGN)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const groupId = context.params.id as string

    try {
      // Fetch group
      const group = await db
        .prepare('SELECT * FROM groups WHERE id = ? AND club_id = ?')
        .bind(groupId, auth.clubId)
        .first()

    if (!group) {
      return errorResponse('Group not found', 404)
    }

    // Fetch members
    const members = await db
      .prepare(`
        SELECT gm.person_id, gm.group_role, gm.added_at,
               p.name, p.email
        FROM group_members gm
        JOIN people p ON p.id = gm.person_id
        WHERE gm.group_id = ?
        ORDER BY gm.group_role, p.name
      `)
      .bind(groupId)
      .all<GroupMember>()

      return jsonResponse({
        group,
        members: members.results,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database error'
      return errorResponse(message, 500)
    }
  }
)

/**
 * PUT /api/admin/groups/:id
 * Update a group
 * Requires: teams.assign permission
 */
export const onRequestPut: PagesFunction<Env> = withPermission(PERMISSIONS.TEAMS_ASSIGN)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const groupId = context.params.id as string

    try {
      const body = await context.request.json() as {
        club_id: string
        name?: string
        kind?: 'team' | 'committee' | 'squad' | 'other'
        description?: string
      }

      // Check group exists
      const existingGroup = await db
        .prepare('SELECT id FROM groups WHERE id = ? AND club_id = ?')
        .bind(groupId, auth.clubId)
        .first()

    if (!existingGroup) {
      return errorResponse('Group not found', 404)
    }

      // Check for duplicate name if name is being changed
      if (body.name) {
        const duplicate = await db
          .prepare('SELECT id FROM groups WHERE club_id = ? AND name = ? AND id != ? AND archived_at IS NULL')
          .bind(auth.clubId, body.name, groupId)
          .first()

      if (duplicate) {
        return errorResponse('A group with this name already exists', 409)
      }
    }

    // Build update fields
    const updates: string[] = []
    const values: (string | null)[] = []

    if (body.name !== undefined) {
      updates.push('name = ?')
      values.push(body.name)
    }
    if (body.kind !== undefined) {
      updates.push('kind = ?')
      values.push(body.kind)
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      values.push(body.description || null)
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400)
    }

    // Execute update
    await db
      .prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values, groupId)
      .run()

      // Fetch updated group
      const group = await db
        .prepare('SELECT * FROM groups WHERE id = ?')
        .bind(groupId)
        .first()

      return jsonResponse({ group })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database error'
      return errorResponse(message, 500)
    }
  }
)

/**
 * DELETE /api/admin/groups/:id
 * Archive or delete a group
 * Query param: ?hard=true to permanently delete
 * Requires: teams.assign permission
 */
export const onRequestDelete: PagesFunction<Env> = withPermission(PERMISSIONS.TEAMS_ASSIGN)(
  async (context, auth: PermissionContext) => {
    const db = context.env.WWUWH_DB
    const groupId = context.params.id as string
    const url = new URL(context.request.url)
    const hardDelete = url.searchParams.get('hard') === 'true'

    try {
      // Check group exists
      const existingGroup = await db
        .prepare('SELECT id FROM groups WHERE id = ? AND club_id = ?')
        .bind(groupId, auth.clubId)
        .first()

    if (!existingGroup) {
      return errorResponse('Group not found', 404)
    }

    if (hardDelete) {
      // Permanently delete group (cascades to group_members)
      await db
        .prepare('DELETE FROM groups WHERE id = ?')
        .bind(groupId)
        .run()

      return jsonResponse({ success: true, deleted: true })
    } else {
      // Soft delete: archive the group
      await db
        .prepare(`UPDATE groups SET archived_at = datetime('now') WHERE id = ?`)
        .bind(groupId)
        .run()

        return jsonResponse({ success: true, archived: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database error'
      return errorResponse(message, 500)
    }
  }
)
