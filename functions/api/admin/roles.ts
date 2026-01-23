/**
 * Admin Roles Endpoint
 * GET    /api/admin/roles - List all roles with member counts
 * POST   /api/admin/roles - Create a new role
 * PUT    /api/admin/roles - Update a role
 * DELETE /api/admin/roles - Delete a role
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'
import { isAdmin } from '../../middleware/admin'

interface RoleWithCount {
  club_id: string
  role_key: string
  name: string
  permissions_json: string
  member_count: number
}

interface RoleMember {
  person_id: string
  name: string
  email: string
  assigned_at: string
}

/**
 * GET /api/admin/roles
 * Returns all roles for a club with member counts
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')
  const roleKey = url.searchParams.get('role_key')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get person record for admin check
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

    // If role_key provided, get members for that role
    if (roleKey) {
      const members = await db
        .prepare(`
          SELECT
            cmr.person_id,
            p.name,
            p.email,
            cmr.created_at as assigned_at
          FROM club_member_roles cmr
          JOIN people p ON p.id = cmr.person_id
          WHERE cmr.club_id = ? AND cmr.role_key = ?
          ORDER BY p.name
        `)
        .bind(clubId, roleKey)
        .all<RoleMember>()

      const role = await db
        .prepare('SELECT * FROM club_roles WHERE club_id = ? AND role_key = ?')
        .bind(clubId, roleKey)
        .first()

      return jsonResponse({
        role,
        members: members.results,
      })
    }

    // Get all roles with member counts
    const roles = await db
      .prepare(`
        SELECT
          cr.club_id,
          cr.role_key,
          cr.name,
          cr.permissions_json,
          COUNT(cmr.person_id) as member_count
        FROM club_roles cr
        LEFT JOIN club_member_roles cmr ON cmr.club_id = cr.club_id AND cmr.role_key = cr.role_key
        WHERE cr.club_id = ?
        GROUP BY cr.club_id, cr.role_key
        ORDER BY cr.name
      `)
      .bind(clubId)
      .all<RoleWithCount>()

    return jsonResponse({ roles: roles.results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/admin/roles
 * Create a new role
 *
 * Body: { club_id, role_key, name, permissions: string[] }
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      role_key: string
      name: string
      permissions?: string[]
    }

    const { club_id, role_key, name, permissions = [] } = body

    if (!club_id || !role_key || !name) {
      return errorResponse('club_id, role_key, and name are required', 400)
    }

    // Validate role_key format (lowercase, no spaces)
    if (!/^[a-z_]+$/.test(role_key)) {
      return errorResponse('role_key must be lowercase letters and underscores only', 400)
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

    // Check if role already exists
    const existing = await db
      .prepare('SELECT role_key FROM club_roles WHERE club_id = ? AND role_key = ?')
      .bind(club_id, role_key)
      .first()

    if (existing) {
      return errorResponse('Role with this key already exists', 409)
    }

    // Create role
    const permissionsJson = JSON.stringify(permissions)
    await db
      .prepare(`
        INSERT INTO club_roles (club_id, role_key, name, permissions_json)
        VALUES (?, ?, ?, ?)
      `)
      .bind(club_id, role_key, name, permissionsJson)
      .run()

    return jsonResponse({
      role: {
        club_id,
        role_key,
        name,
        permissions_json: permissionsJson,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * PUT /api/admin/roles
 * Update a role's name or permissions
 *
 * Body: { club_id, role_key, name?, permissions?: string[] }
 */
export const onRequestPut: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      role_key: string
      name?: string
      permissions?: string[]
    }

    const { club_id, role_key, name, permissions } = body

    if (!club_id || !role_key) {
      return errorResponse('club_id and role_key are required', 400)
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
    const existing = await db
      .prepare('SELECT * FROM club_roles WHERE club_id = ? AND role_key = ?')
      .bind(club_id, role_key)
      .first()

    if (!existing) {
      return errorResponse('Role not found', 404)
    }

    // Build update
    const updates: string[] = []
    const values: string[] = []

    if (name !== undefined) {
      updates.push('name = ?')
      values.push(name)
    }

    if (permissions !== undefined) {
      updates.push('permissions_json = ?')
      values.push(JSON.stringify(permissions))
    }

    if (updates.length === 0) {
      return errorResponse('No updates provided', 400)
    }

    values.push(club_id, role_key)

    await db
      .prepare(`UPDATE club_roles SET ${updates.join(', ')} WHERE club_id = ? AND role_key = ?`)
      .bind(...values)
      .run()

    // Return updated role
    const updated = await db
      .prepare('SELECT * FROM club_roles WHERE club_id = ? AND role_key = ?')
      .bind(club_id, role_key)
      .first()

    return jsonResponse({ role: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/roles
 * Delete a role (and all assignments)
 *
 * Body: { club_id, role_key }
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    const body = await context.request.json() as {
      club_id: string
      role_key: string
    }

    const { club_id, role_key } = body

    if (!club_id || !role_key) {
      return errorResponse('club_id and role_key are required', 400)
    }

    // Prevent deleting admin role
    if (role_key === 'admin') {
      return errorResponse('Cannot delete the admin role', 400)
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

    // Delete role (cascade will remove assignments)
    await db
      .prepare('DELETE FROM club_roles WHERE club_id = ? AND role_key = ?')
      .bind(club_id, role_key)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
