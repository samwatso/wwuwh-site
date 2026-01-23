/**
 * useBillingPlans Hook
 *
 * Fetches available billing plans for a club.
 */

import { useState, useEffect, useCallback } from 'react'
import { listBillingPlans, BillingPlan } from '@/lib/api'

export interface UseBillingPlansReturn {
  plans: BillingPlan[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useBillingPlans(clubId: string): UseBillingPlansReturn {
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlans = useCallback(async () => {
    if (!clubId) {
      setPlans([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await listBillingPlans(clubId)
      setPlans(response.plans)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plans'
      setError(message)
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  return {
    plans,
    loading,
    error,
    refresh: fetchPlans,
  }
}
