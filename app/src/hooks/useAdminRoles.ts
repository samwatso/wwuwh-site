/**
 * useAdminRoles Hook
 *
 * Fetches and manages roles for admin view.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getAdminRoles,
  getAdminRoleDetail,
  createAdminRole,
  updateAdminRole,
  deleteAdminRole,
  assignRoleToMember,
  removeRoleFromMember,
  AdminRole,
  RoleMember,
} from '@/lib/api'

export interface UseAdminRolesParams {
  clubId: string
}

export interface UseAdminRolesReturn {
  roles: AdminRole[]
  loading: boolean
  error: string | null
  saving: boolean
  refresh: () => Promise<void>
  createRole: (roleKey: string, name: string, permissions?: string[]) => Promise<void>
  updateRole: (roleKey: string, name?: string, permissions?: string[]) => Promise<void>
  deleteRole: (roleKey: string) => Promise<void>
  getRoleMembers: (roleKey: string) => Promise<RoleMember[]>
  assignMember: (roleKey: string, personId: string) => Promise<void>
  removeMember: (roleKey: string, personId: string) => Promise<void>
}

export function useAdminRoles(params: UseAdminRolesParams): UseAdminRolesReturn {
  const { clubId } = params

  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchRoles = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getAdminRoles(clubId)
      setRoles(response.roles)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load roles'
      setError(message)
      setRoles([])
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const createRole = useCallback(
    async (roleKey: string, name: string, permissions?: string[]) => {
      if (!clubId) return

      setSaving(true)
      try {
        await createAdminRole({
          club_id: clubId,
          role_key: roleKey,
          name,
          permissions,
        })
        await fetchRoles()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create role'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchRoles]
  )

  const updateRole = useCallback(
    async (roleKey: string, name?: string, permissions?: string[]) => {
      if (!clubId) return

      setSaving(true)
      try {
        await updateAdminRole({
          club_id: clubId,
          role_key: roleKey,
          name,
          permissions,
        })
        await fetchRoles()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update role'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchRoles]
  )

  const deleteRoleFn = useCallback(
    async (roleKey: string) => {
      if (!clubId) return

      setSaving(true)
      try {
        await deleteAdminRole(clubId, roleKey)
        await fetchRoles()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete role'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchRoles]
  )

  const getRoleMembers = useCallback(
    async (roleKey: string): Promise<RoleMember[]> => {
      if (!clubId) return []

      try {
        const response = await getAdminRoleDetail(clubId, roleKey)
        return response.members
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load role members'
        throw new Error(message)
      }
    },
    [clubId]
  )

  const assignMember = useCallback(
    async (roleKey: string, personId: string) => {
      if (!clubId) return

      setSaving(true)
      try {
        await assignRoleToMember(clubId, roleKey, personId)
        await fetchRoles()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to assign member'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchRoles]
  )

  const removeMember = useCallback(
    async (roleKey: string, personId: string) => {
      if (!clubId) return

      setSaving(true)
      try {
        await removeRoleFromMember(clubId, roleKey, personId)
        await fetchRoles()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove member'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchRoles]
  )

  return {
    roles,
    loading,
    error,
    saving,
    refresh: fetchRoles,
    createRole,
    updateRole,
    deleteRole: deleteRoleFn,
    getRoleMembers,
    assignMember,
    removeMember,
  }
}
