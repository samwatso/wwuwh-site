/**
 * Admin Group Members Endpoint
 * POST   /api/admin/groups/:id/members - Add member to group
 * DELETE /api/admin/groups/:id/members - Remove member from group
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

/**
 * POST /api/admin/groups/:id/members
 * Add a member to a group
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const groupId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      person_id: string
      group_role?: 'member' | 'coach' | 'captain' | 'admin'
    }

    const { club_id, person_id } = body

    if (!club_id || !person_id) {
      return errorResponse('club_id and person_id are required', 400)
    }

    // Get admin person record
    const adminPerson = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!adminPerson) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, adminPerson.id, club_id)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Check group exists and belongs to club
    const group = await db
      .prepare('SELECT id FROM groups WHERE id = ? AND club_id = ? AND archived_at IS NULL')
      .bind(groupId, club_id)
      .first()

    if (!group) {
      return errorResponse('Group not found', 404)
    }

    // Check person is a member of the club
    const membership = await db
      .prepare('SELECT id FROM club_memberships WHERE club_id = ? AND person_id = ?')
      .bind(club_id, person_id)
      .first()

    if (!membership) {
      return errorResponse('Person is not a member of this club', 400)
    }

    // Check if already in group
    const existing = await db
      .prepare('SELECT group_id FROM group_members WHERE group_id = ? AND person_id = ?')
      .bind(groupId, person_id)
      .first()

    if (existing) {
      return errorResponse('Member is already in this group', 409)
    }

    // Add member to group
    await db
      .prepare(`
        INSERT INTO group_members (group_id, person_id, group_role, added_at)
        VALUES (?, ?, ?, datetime('now'))
      `)
      .bind(groupId, person_id, body.group_role || 'member')
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/groups/:id/members
 * Remove a member from a group
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const groupId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      person_id: string
    }

    const { club_id, person_id } = body

    if (!club_id || !person_id) {
      return errorResponse('club_id and person_id are required', 400)
    }

    // Get admin person record
    const adminPerson = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!adminPerson) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, adminPerson.id, club_id)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Check group exists
    const group = await db
      .prepare('SELECT id FROM groups WHERE id = ? AND club_id = ?')
      .bind(groupId, club_id)
      .first()

    if (!group) {
      return errorResponse('Group not found', 404)
    }

    // Remove member from group
    await db
      .prepare('DELETE FROM group_members WHERE group_id = ? AND person_id = ?')
      .bind(groupId, person_id)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * PUT /api/admin/groups/:id/members
 * Update a member's role in a group
 */
export const onRequestPut: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const groupId = context.params.id as string

  try {
    const body = await context.request.json() as {
      club_id: string
      person_id: string
      group_role: 'member' | 'coach' | 'captain' | 'admin'
    }

    const { club_id, person_id, group_role } = body

    if (!club_id || !person_id || !group_role) {
      return errorResponse('club_id, person_id, and group_role are required', 400)
    }

    // Get admin person record
    const adminPerson = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!adminPerson) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, adminPerson.id, club_id)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Update member role
    await db
      .prepare('UPDATE group_members SET group_role = ? WHERE group_id = ? AND person_id = ?')
      .bind(group_role, groupId, person_id)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
