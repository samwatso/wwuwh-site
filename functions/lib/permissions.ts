/**
 * Permission Checking Utilities
 *
 * Checks user permissions based on their roles in club_member_roles
 * and the permissions_json in club_roles.
 *
 * Role permissions are stored as JSON arrays like:
 *   ["members.view", "events.create", "events.edit"]
 *
 * Special case: Admin role has {"admin": true} which grants all permissions.
 */

// Available permission keys (for reference/validation)
export const PERMISSIONS = {
  // Member permissions
  MEMBERS_VIEW: 'members.view',
  MEMBERS_EDIT: 'members.edit',

  // Event permissions
  EVENTS_CREATE: 'events.create',
  EVENTS_EDIT: 'events.edit',

  // Team permissions
  TEAMS_ASSIGN: 'teams.assign',

  // Billing permissions
  BILLING_VIEW: 'billing.view',

  // Role management
  ROLES_MANAGE: 'roles.manage',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

interface RolePermissions {
  role_key: string
  permissions_json: string
}

/**
 * Parse permissions from JSON string
 * Handles both array format ["perm1", "perm2"] and admin object {"admin": true}
 */
function parsePermissions(json: string | null | undefined): { isAdmin: boolean; permissions: string[] } {
  if (!json) return { isAdmin: false, permissions: [] }

  try {
    const parsed = JSON.parse(json)

    // Check for admin flag: {"admin": true}
    if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed.admin === true) {
      return { isAdmin: true, permissions: [] }
    }

    // Regular permission array
    if (Array.isArray(parsed)) {
      return { isAdmin: false, permissions: parsed.filter((p) => typeof p === 'string') }
    }

    return { isAdmin: false, permissions: [] }
  } catch {
    return { isAdmin: false, permissions: [] }
  }
}

/**
 * Get all permissions for a user in a specific club
 *
 * Returns:
 * - isAdmin: true if user has admin role (full access)
 * - permissions: array of permission strings from all their roles
 * - roles: array of role_keys the user has
 */
export async function getUserPermissions(
  db: D1Database,
  personId: string,
  clubId: string
): Promise<{ isAdmin: boolean; permissions: string[]; roles: string[] }> {
  // Get all roles and their permissions for this user in this club
  const result = await db
    .prepare(
      `
      SELECT cr.role_key, cr.permissions_json
      FROM club_member_roles cmr
      JOIN club_roles cr ON cr.club_id = cmr.club_id AND cr.role_key = cmr.role_key
      WHERE cmr.club_id = ? AND cmr.person_id = ?
    `
    )
    .bind(clubId, personId)
    .all<RolePermissions>()

  const roles: string[] = []
  const allPermissions = new Set<string>()
  let isAdmin = false

  for (const row of result.results) {
    roles.push(row.role_key)

    const { isAdmin: roleIsAdmin, permissions } = parsePermissions(row.permissions_json)

    if (roleIsAdmin) {
      isAdmin = true
    }

    for (const perm of permissions) {
      allPermissions.add(perm)
    }
  }

  return {
    isAdmin,
    permissions: Array.from(allPermissions),
    roles,
  }
}

/**
 * Check if a user has a specific permission in a club
 *
 * Returns true if:
 * - User has the admin role (full access), OR
 * - User has a role that includes the required permission
 */
export async function hasPermission(
  db: D1Database,
  personId: string,
  clubId: string,
  requiredPermission: string
): Promise<boolean> {
  const { isAdmin, permissions } = await getUserPermissions(db, personId, clubId)

  // Admin has all permissions
  if (isAdmin) {
    return true
  }

  return permissions.includes(requiredPermission)
}

/**
 * Check if a user has ANY of the specified permissions
 */
export async function hasAnyPermission(
  db: D1Database,
  personId: string,
  clubId: string,
  requiredPermissions: string[]
): Promise<boolean> {
  const { isAdmin, permissions } = await getUserPermissions(db, personId, clubId)

  if (isAdmin) {
    return true
  }

  return requiredPermissions.some((perm) => permissions.includes(perm))
}

/**
 * Check if a user has ALL of the specified permissions
 */
export async function hasAllPermissions(
  db: D1Database,
  personId: string,
  clubId: string,
  requiredPermissions: string[]
): Promise<boolean> {
  const { isAdmin, permissions } = await getUserPermissions(db, personId, clubId)

  if (isAdmin) {
    return true
  }

  return requiredPermissions.every((perm) => permissions.includes(perm))
}

/**
 * Check if a user is an admin for a club
 * (shorthand for checking if they have full admin access)
 */
export async function isClubAdmin(db: D1Database, personId: string, clubId: string): Promise<boolean> {
  const { isAdmin } = await getUserPermissions(db, personId, clubId)
  return isAdmin
}
