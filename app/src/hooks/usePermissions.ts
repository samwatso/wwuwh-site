/**
 * usePermissions Hook
 *
 * Provides permission checking utilities for the current user.
 * Uses clubPermissions from the useProfile hook.
 */

import { useMemo } from 'react'
import { useProfile } from './useProfile'

// Available permission keys (must match backend PERMISSIONS)
export const PERMISSIONS = {
  MEMBERS_VIEW: 'members.view',
  MEMBERS_EDIT: 'members.edit',
  EVENTS_CREATE: 'events.create',
  EVENTS_EDIT: 'events.edit',
  TEAMS_ASSIGN: 'teams.assign',
  BILLING_VIEW: 'billing.view',
  ROLES_MANAGE: 'roles.manage',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export interface UsePermissionsReturn {
  /** Whether permission data is still loading */
  loading: boolean
  /** Whether user has admin access for the current club */
  isAdmin: boolean
  /** All permissions the user has for the current club */
  permissions: string[]
  /** All roles the user has for the current club */
  roles: string[]
  /** Check if user has a specific permission */
  hasPermission: (permission: string) => boolean
  /** Check if user has ANY of the specified permissions */
  hasAnyPermission: (permissions: string[]) => boolean
  /** Check if user has ALL of the specified permissions */
  hasAllPermissions: (permissions: string[]) => boolean
  /** Check if user can access admin features (has any admin-level permission) */
  canAccessAdmin: boolean
}

/**
 * Hook to check user permissions for the current club
 *
 * @param clubId - Optional club ID override. If not provided, uses first membership's club.
 */
export function usePermissions(clubId?: string): UsePermissionsReturn {
  const { memberships, clubPermissions, loading } = useProfile()

  // Determine which club to check permissions for
  const effectiveClubId = clubId || (memberships.length > 0 ? memberships[0].club_id : '')

  // Get permissions for the effective club
  const perms = useMemo(() => {
    if (!effectiveClubId || !clubPermissions[effectiveClubId]) {
      return { isAdmin: false, permissions: [], roles: [] }
    }
    return clubPermissions[effectiveClubId]
  }, [effectiveClubId, clubPermissions])

  // Permission checking functions
  const hasPermission = useMemo(() => {
    return (permission: string): boolean => {
      if (perms.isAdmin) return true
      return perms.permissions.includes(permission)
    }
  }, [perms])

  const hasAnyPermission = useMemo(() => {
    return (permissions: string[]): boolean => {
      if (perms.isAdmin) return true
      return permissions.some((p) => perms.permissions.includes(p))
    }
  }, [perms])

  const hasAllPermissions = useMemo(() => {
    return (permissions: string[]): boolean => {
      if (perms.isAdmin) return true
      return permissions.every((p) => perms.permissions.includes(p))
    }
  }, [perms])

  // Check if user can access any admin features
  const canAccessAdmin = useMemo(() => {
    if (perms.isAdmin) return true
    // User can access admin if they have any permission
    return perms.permissions.length > 0
  }, [perms])

  return {
    loading,
    isAdmin: perms.isAdmin,
    permissions: perms.permissions,
    roles: perms.roles,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessAdmin,
  }
}
