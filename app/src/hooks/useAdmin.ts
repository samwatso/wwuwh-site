/**
 * useAdmin Hook
 *
 * Provides admin status and context for the current user.
 * Derives admin status from the user's roles.
 */

import { useMemo } from 'react'
import { useProfile } from './useProfile'

export interface UseAdminReturn {
  isAdmin: boolean
  adminClubIds: string[] // Clubs where user is admin
  loading: boolean
}

export function useAdmin(): UseAdminReturn {
  const { roles, loading } = useProfile()

  const adminClubIds = useMemo(() => {
    return roles
      .filter((role) => role.role_key === 'admin')
      .map((role) => role.club_id)
  }, [roles])

  const isAdmin = adminClubIds.length > 0

  return {
    isAdmin,
    adminClubIds,
    loading,
  }
}

/**
 * Check if user is admin for a specific club
 */
export function useIsAdminForClub(clubId: string): boolean {
  const { adminClubIds } = useAdmin()
  return adminClubIds.includes(clubId)
}
