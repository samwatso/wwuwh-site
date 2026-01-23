/**
 * Admin Role Members Endpoint
 * POST   /api/admin/role-members - Assign role to member
 * DELETE /api/admin/role-members - Remove role from member
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'
import { isAdmin } from '../../middleware/admin'

/**
 * POST /api/admin/role-members
 * Assign a role to a member
 *
 * Body: { club_id, role_key, person_id }
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      role_key: string
      person_id: string
    }

    const { club_id, role_key, person_id } = body

    if (!club_id || !role_key || !person_id) {
      return errorResponse('club_id, role_key, and person_id are required', 400)
    }

    // Get person record for admin check
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

    // Check if role exists
    const roleExists = await db
      .prepare('SELECT role_key FROM club_roles WHERE club_id = ? AND role_key = ?')
      .bind(club_id, role_key)
      .first()

    if (!roleExists) {
      return errorResponse('Role not found', 404)
    }

    // Check if person is a member of the club
    const membership = await db
      .prepare('SELECT id FROM club_memberships WHERE club_id = ? AND person_id = ?')
      .bind(club_id, person_id)
      .first()

    if (!membership) {
      return errorResponse('Person is not a member of this club', 400)
    }

    // Check if already assigned
    const existing = await db
      .prepare('SELECT role_key FROM club_member_roles WHERE club_id = ? AND person_id = ? AND role_key = ?')
      .bind(club_id, person_id, role_key)
      .first()

    if (existing) {
      return errorResponse('Member already has this role', 409)
    }

    // Assign role
    await db
      .prepare(`
        INSERT INTO club_member_roles (club_id, person_id, role_key, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `)
      .bind(club_id, person_id, role_key)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/role-members
 * Remove a role from a member
 *
 * Body: { club_id, role_key, person_id }
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      role_key: string
      person_id: string
    }

    const { club_id, role_key, person_id } = body

    if (!club_id || !role_key || !person_id) {
      return errorResponse('club_id, role_key, and person_id are required', 400)
    }

    // Get person record for admin check
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

    // Prevent removing your own admin role
    if (role_key === 'admin' && person_id === adminPerson.id) {
      return errorResponse('Cannot remove your own admin role', 400)
    }

    // Remove role assignment
    await db
      .prepare('DELETE FROM club_member_roles WHERE club_id = ? AND person_id = ? AND role_key = ?')
      .bind(club_id, person_id, role_key)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
