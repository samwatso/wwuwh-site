/**
 * Permission Middleware for API Routes
 *
 * Verifies user has specific permissions for the specified club.
 * Uses the permission system from lib/permissions.ts.
 *
 * Usage:
 * ```ts
 * import { withPermission } from '../middleware/permission'
 * import { PERMISSIONS } from '../lib/permissions'
 *
 * // Require a single permission
 * export const onRequestPost = withPermission(PERMISSIONS.EVENTS_CREATE)(
 *   async (context, auth) => {
 *     // auth.user - auth user from JWT
 *     // auth.person - person record from D1
 *     // auth.clubId - the club ID
 *     // auth.permissions - user's permissions in this club
 *     // auth.isAdmin - whether user has admin access
 *     return jsonResponse({ data })
 *   }
 * )
 *
 * // Require any of multiple permissions
 * export const onRequestGet = withAnyPermission([
 *   PERMISSIONS.MEMBERS_VIEW,
 *   PERMISSIONS.BILLING_VIEW
 * ])(async (context, auth) => { ... })
 * ```
 */

import { Env, errorResponse } from '../types'
import { withAuth, AuthUser } from './auth'
import { getUserPermissions } from '../lib/permissions'

export interface PermissionContext {
  user: AuthUser
  person: { id: string; name: string; email: string }
  clubId: string
  permissions: string[]
  roles: string[]
  isAdmin: boolean
}

type PermissionHandler<E extends Env> = (
  context: EventContext<E, string, Record<string, unknown>>,
  auth: PermissionContext
) => Promise<Response>

/**
 * Extract club_id from request (query params or body)
 */
async function extractClubId(request: Request): Promise<string | null> {
  const url = new URL(request.url)
  let clubId = url.searchParams.get('club_id')

  if (!clubId && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    try {
      const clonedRequest = request.clone()
      const body = (await clonedRequest.json()) as { club_id?: string }
      clubId = body.club_id || null
    } catch {
      // Body parsing failed
    }
  }

  return clubId
}

/**
 * Get person and permission context for the authenticated user
 */
async function getPermissionContext(
  db: D1Database,
  user: AuthUser,
  clubId: string
): Promise<PermissionContext | null> {
  // Get person record
  const person = await db
    .prepare('SELECT id, name, email FROM people WHERE auth_user_id = ?')
    .bind(user.id)
    .first<{ id: string; name: string; email: string }>()

  if (!person) {
    return null
  }

  // Get permissions
  const { isAdmin, permissions, roles } = await getUserPermissions(db, person.id, clubId)

  return {
    user,
    person,
    clubId,
    permissions,
    roles,
    isAdmin,
  }
}

/**
 * Middleware that requires a specific permission
 *
 * @param requiredPermission - The permission key required (e.g., 'events.create')
 */
export function withPermission<E extends Env>(requiredPermission: string) {
  return (handler: PermissionHandler<E>): PagesFunction<E> => {
    return withAuth(async (context, user) => {
      const db = (context.env as Env).WWUWH_DB

      const clubId = await extractClubId(context.request)
      if (!clubId) {
        return errorResponse('club_id is required', 400)
      }

      const auth = await getPermissionContext(db, user, clubId)
      if (!auth) {
        return errorResponse('Profile not found', 404)
      }

      // Check permission
      if (!auth.isAdmin && !auth.permissions.includes(requiredPermission)) {
        return errorResponse(`Permission denied. Required: ${requiredPermission}`, 403)
      }

      return handler(context, auth)
    })
  }
}

/**
 * Middleware that requires ANY of the specified permissions
 *
 * @param requiredPermissions - Array of permission keys (user needs at least one)
 */
export function withAnyPermission<E extends Env>(requiredPermissions: string[]) {
  return (handler: PermissionHandler<E>): PagesFunction<E> => {
    return withAuth(async (context, user) => {
      const db = (context.env as Env).WWUWH_DB

      const clubId = await extractClubId(context.request)
      if (!clubId) {
        return errorResponse('club_id is required', 400)
      }

      const auth = await getPermissionContext(db, user, clubId)
      if (!auth) {
        return errorResponse('Profile not found', 404)
      }

      // Check if user has any of the required permissions
      const hasAny = auth.isAdmin || requiredPermissions.some((p) => auth.permissions.includes(p))
      if (!hasAny) {
        return errorResponse(`Permission denied. Required one of: ${requiredPermissions.join(', ')}`, 403)
      }

      return handler(context, auth)
    })
  }
}

/**
 * Middleware that requires ALL of the specified permissions
 *
 * @param requiredPermissions - Array of permission keys (user needs all of them)
 */
export function withAllPermissions<E extends Env>(requiredPermissions: string[]) {
  return (handler: PermissionHandler<E>): PagesFunction<E> => {
    return withAuth(async (context, user) => {
      const db = (context.env as Env).WWUWH_DB

      const clubId = await extractClubId(context.request)
      if (!clubId) {
        return errorResponse('club_id is required', 400)
      }

      const auth = await getPermissionContext(db, user, clubId)
      if (!auth) {
        return errorResponse('Profile not found', 404)
      }

      // Check if user has all required permissions
      const hasAll = auth.isAdmin || requiredPermissions.every((p) => auth.permissions.includes(p))
      if (!hasAll) {
        return errorResponse(`Permission denied. Required all of: ${requiredPermissions.join(', ')}`, 403)
      }

      return handler(context, auth)
    })
  }
}

/**
 * Middleware that requires admin access (full permissions)
 * This is equivalent to the old withAdmin but uses the new permission system
 */
export function withAdminPermission<E extends Env>(handler: PermissionHandler<E>): PagesFunction<E> {
  return withAuth(async (context, user) => {
    const db = (context.env as Env).WWUWH_DB

    const clubId = await extractClubId(context.request)
    if (!clubId) {
      return errorResponse('club_id is required', 400)
    }

    const auth = await getPermissionContext(db, user, clubId)
    if (!auth) {
      return errorResponse('Profile not found', 404)
    }

    if (!auth.isAdmin) {
      return errorResponse('Admin access required', 403)
    }

    return handler(context, auth)
  })
}

/**
 * Middleware that loads permission context but doesn't require any specific permission
 * Useful for endpoints where you want to check permissions conditionally in the handler
 */
export function withPermissionContext<E extends Env>(handler: PermissionHandler<E>): PagesFunction<E> {
  return withAuth(async (context, user) => {
    const db = (context.env as Env).WWUWH_DB

    const clubId = await extractClubId(context.request)
    if (!clubId) {
      return errorResponse('club_id is required', 400)
    }

    const auth = await getPermissionContext(db, user, clubId)
    if (!auth) {
      return errorResponse('Profile not found', 404)
    }

    return handler(context, auth)
  })
}
