/**
 * useAdminGroups Hook
 *
 * Manages groups and group members for admin view.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getAdminGroups,
  getGroupDetail,
  createGroup,
  updateGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  updateGroupMemberRole,
  AdminGroup,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
} from '@/lib/api'

export interface UseAdminGroupsParams {
  clubId: string
}

export interface UseAdminGroupsReturn {
  groups: AdminGroup[]
  loading: boolean
  error: string | null
  saving: boolean
  refresh: () => Promise<void>
  createGroup: (request: Omit<CreateGroupRequest, 'club_id'>) => Promise<AdminGroup>
  updateGroup: (groupId: string, request: Omit<UpdateGroupRequest, 'club_id'>) => Promise<AdminGroup>
  archiveGroup: (groupId: string) => Promise<void>
  deleteGroup: (groupId: string) => Promise<void>
  getGroupMembers: (groupId: string) => Promise<GroupMember[]>
  addMember: (groupId: string, personId: string, role?: 'member' | 'coach' | 'captain' | 'admin') => Promise<void>
  removeMember: (groupId: string, personId: string) => Promise<void>
  updateMemberRole: (groupId: string, personId: string, role: 'member' | 'coach' | 'captain' | 'admin') => Promise<void>
}

export function useAdminGroups(params: UseAdminGroupsParams): UseAdminGroupsReturn {
  const { clubId } = params

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchGroups = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getAdminGroups(clubId)
      setGroups(response.groups)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load groups'
      setError(message)
      setGroups([])
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const createGroupFn = useCallback(
    async (request: Omit<CreateGroupRequest, 'club_id'>): Promise<AdminGroup> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const response = await createGroup({ ...request, club_id: clubId })
        await fetchGroups()
        return response.group
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchGroups]
  )

  const updateGroupFn = useCallback(
    async (groupId: string, request: Omit<UpdateGroupRequest, 'club_id'>): Promise<AdminGroup> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const response = await updateGroup(groupId, { ...request, club_id: clubId })
        await fetchGroups()
        return response.group
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchGroups]
  )

  const archiveGroupFn = useCallback(
    async (groupId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await deleteGroup(groupId, clubId, false)
        await fetchGroups()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchGroups]
  )

  const deleteGroupFn = useCallback(
    async (groupId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await deleteGroup(groupId, clubId, true)
        await fetchGroups()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchGroups]
  )

  const getGroupMembers = useCallback(
    async (groupId: string): Promise<GroupMember[]> => {
      if (!clubId) return []

      try {
        const response = await getGroupDetail(groupId, clubId)
        return response.members
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load members'
        throw new Error(message)
      }
    },
    [clubId]
  )

  const addMemberFn = useCallback(
    async (groupId: string, personId: string, role?: 'member' | 'coach' | 'captain' | 'admin'): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await addGroupMember(groupId, clubId, personId, role)
        await fetchGroups()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchGroups]
  )

  const removeMemberFn = useCallback(
    async (groupId: string, personId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await removeGroupMember(groupId, clubId, personId)
        await fetchGroups()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchGroups]
  )

  const updateMemberRoleFn = useCallback(
    async (groupId: string, personId: string, role: 'member' | 'coach' | 'captain' | 'admin'): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await updateGroupMemberRole(groupId, clubId, personId, role)
      } finally {
        setSaving(false)
      }
    },
    [clubId]
  )

  return {
    groups,
    loading,
    error,
    saving,
    refresh: fetchGroups,
    createGroup: createGroupFn,
    updateGroup: updateGroupFn,
    archiveGroup: archiveGroupFn,
    deleteGroup: deleteGroupFn,
    getGroupMembers,
    addMember: addMemberFn,
    removeMember: removeMemberFn,
    updateMemberRole: updateMemberRoleFn,
  }
}
