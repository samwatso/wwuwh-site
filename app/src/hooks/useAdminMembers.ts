/**
 * useAdminMembers Hook
 *
 * Fetches and manages member data for admin view.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getAdminMembers,
  AdminMember,
  AdminMembersStats,
} from '@/lib/api'

export interface UseAdminMembersParams {
  clubId: string
  search?: string
  status?: string
}

export interface UseAdminMembersReturn {
  members: AdminMember[]
  stats: AdminMembersStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setSearch: (search: string) => void
  setStatus: (status: string) => void
}

export function useAdminMembers(params: UseAdminMembersParams): UseAdminMembersReturn {
  const { clubId } = params

  const [members, setMembers] = useState<AdminMember[]>([])
  const [stats, setStats] = useState<AdminMembersStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(params.search || '')
  const [status, setStatus] = useState(params.status || '')

  const fetchMembers = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getAdminMembers({
        club_id: clubId,
        search: search || undefined,
        status: status || undefined,
      })
      setMembers(response.members)
      setStats(response.stats)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load members'
      setError(message)
      setMembers([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [clubId, search, status])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  return {
    members,
    stats,
    loading,
    error,
    refresh: fetchMembers,
    setSearch,
    setStatus,
  }
}
