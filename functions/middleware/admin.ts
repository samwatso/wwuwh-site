/**
 * Admin Middleware for API Routes
 *
 * Verifies user has admin role for the specified club.
 * Extends withAuth to also check admin permissions.
 *
 * NOTE: For new endpoints, prefer using the permission middleware:
 *   import { withPermission, withAdminPermission } from '../middleware/permission'
 *   import { PERMISSIONS } from '../lib/permissions'
 *
 * The permission middleware provides:
 *   - Granular permission checking (not just admin)
 *   - Permission context in the handler (auth.permissions, auth.isAdmin)
 *   - Support for role-based permissions from club_roles.permissions_json
 */

import { Env, errorResponse } from '../types'
import { withAuth, AuthUser } from './auth'
import { isClubAdmin } from '../lib/permissions'

export interface AdminContext {
  user: AuthUser
  person: { id: string; name: string; email: string }
  clubId: string
}

/**
 * Admin middleware for Pages Functions
 *
 * Usage:
 * ```ts
 * import { withAdmin } from '../middleware/admin'
 *
 * export const onRequestGet: PagesFunction<Env> = withAdmin(async (context, admin) => {
 *   // admin.user - auth user
 *   // admin.person - person record from D1
 *   // admin.clubId - the club they're admin of
 *   return jsonResponse({ data })
 * })
 * ```
 *
 * Requires club_id in query params or request body.
 */
export function withAdmin<E extends Env>(
  handler: (
    context: EventContext<E, string, Record<string, unknown>>,
    admin: AdminContext
  ) => Promise<Response>
): PagesFunction<E> {
  return withAuth(async (context, user) => {
    const db = (context.env as Env).WWUWH_DB

    // Get club_id from query params or body
    let clubId: string | null = null

    const url = new URL(context.request.url)
    clubId = url.searchParams.get('club_id')

    // If not in query, try request body for POST/PUT
    if (!clubId && ['POST', 'PUT', 'PATCH'].includes(context.request.method)) {
      try {
        const clonedRequest = context.request.clone()
        const body = await clonedRequest.json() as { club_id?: string }
        clubId = body.club_id || null
      } catch {
        // Body parsing failed, that's OK
      }
    }

    if (!clubId) {
      return errorResponse('club_id is required', 400)
    }

    // Get person record
    const person = await db
      .prepare('SELECT id, name, email FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string; name: string; email: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminRole = await db
      .prepare(`
        SELECT 1 FROM club_member_roles
        WHERE club_id = ? AND person_id = ? AND role_key = 'admin'
      `)
      .bind(clubId, person.id)
      .first()

    if (!adminRole) {
      return errorResponse('Admin access required', 403)
    }

    // Call handler with admin context
    return handler(context, {
      user,
      person,
      clubId,
    })
  })
}

/**
 * Check if a user is admin for a club (utility function)
 *
 * Uses the permission system to check if user has admin access.
 * Admin access is granted when a user has a role with {"admin": true} in permissions_json.
 */
export async function isAdmin(
  db: D1Database,
  personId: string,
  clubId: string
): Promise<boolean> {
  return isClubAdmin(db, personId, clubId)
}
