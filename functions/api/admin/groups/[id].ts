/**
 * Admin Group Detail Endpoint
 * GET    /api/admin/groups/:id - Get group details with members
 * PUT    /api/admin/groups/:id - Update group
 * DELETE /api/admin/groups/:id - Archive/delete group
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'

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
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const groupId = context.params.id as string
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get person record
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

    // Fetch group
    const group = await db
      .prepare('SELECT * FROM groups WHERE id = ? AND club_id = ?')
      .bind(groupId, clubId)
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
})

/**
 * PUT /api/admin/groups/:id
 * Update a group
 */
export const onRequestPut: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const groupId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      name?: string
      kind?: 'team' | 'committee' | 'squad' | 'other'
      description?: string
    }

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

    // Check group exists
    const existingGroup = await db
      .prepare('SELECT id FROM groups WHERE id = ? AND club_id = ?')
      .bind(groupId, club_id)
      .first()

    if (!existingGroup) {
      return errorResponse('Group not found', 404)
    }

    // Check for duplicate name if name is being changed
    if (body.name) {
      const duplicate = await db
        .prepare('SELECT id FROM groups WHERE club_id = ? AND name = ? AND id != ? AND archived_at IS NULL')
        .bind(club_id, body.name, groupId)
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
})

/**
 * DELETE /api/admin/groups/:id
 * Archive or delete a group
 * Query param: ?hard=true to permanently delete
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const groupId = context.params.id as string
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')
  const hardDelete = url.searchParams.get('hard') === 'true'

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get person record
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

    // Check group exists
    const existingGroup = await db
      .prepare('SELECT id FROM groups WHERE id = ? AND club_id = ?')
      .bind(groupId, clubId)
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
})
