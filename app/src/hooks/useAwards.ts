/**
 * useAwards Hook
 *
 * Fetches and manages user awards and streak data.
 */

import { useState, useEffect, useCallback } from 'react'

export interface Award {
  id: string
  award_id: string
  name: string
  description: string
  icon: string | null
  granted_at: string
  meta: Record<string, unknown> | null
}

export interface LockedAward {
  id: string
  name: string
  description: string
  icon: string | null
}

interface AwardsResponse {
  awards: Award[]
  locked_awards: LockedAward[]
  current_streak: number
}

export interface UseAwardsReturn {
  awards: Award[]
  lockedAwards: LockedAward[]
  currentStreak: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useAwards(): UseAwardsReturn {
  const [awards, setAwards] = useState<Award[]>([])
  const [lockedAwards, setLockedAwards] = useState<LockedAward[]>([])
  const [currentStreak, setCurrentStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAwards = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/me/awards', {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 404) {
          // No profile yet, just return empty
          setAwards([])
          setLockedAwards([])
          setCurrentStreak(0)
          return
        }
        throw new Error('Failed to fetch awards')
      }

      const data: AwardsResponse = await response.json()
      setAwards(data.awards)
      setLockedAwards(data.locked_awards)
      setCurrentStreak(data.current_streak)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load awards'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAwards()
  }, [fetchAwards])

  return {
    awards,
    lockedAwards,
    currentStreak,
    loading,
    error,
    refresh: fetchAwards,
  }
}
