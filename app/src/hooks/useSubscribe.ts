/**
 * useSubscribe Hook
 *
 * Handles subscription checkout flow.
 */

import { useState, useCallback } from 'react'
import { createSubscription, createBillingPortalSession } from '@/lib/api'

export interface UseSubscribeReturn {
  subscribe: (planId: string) => Promise<void>
  subscribing: string | null // plan ID being processed
  openBillingPortal: () => Promise<void>
  openingPortal: boolean
  error: string | null
}

export function useSubscribe(): UseSubscribeReturn {
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subscribe = useCallback(async (planId: string) => {
    setSubscribing(planId)
    setError(null)

    try {
      const response = await createSubscription(planId)
      // Redirect to Stripe Checkout
      window.location.href = response.checkout_url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout'
      setError(message)
      setSubscribing(null)
    }
  }, [])

  const openBillingPortal = useCallback(async () => {
    setOpeningPortal(true)
    setError(null)

    try {
      const response = await createBillingPortalSession()
      // Redirect to Stripe Customer Portal
      window.location.href = response.url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal'
      setError(message)
      setOpeningPortal(false)
    }
  }, [])

  return {
    subscribe,
    subscribing,
    openBillingPortal,
    openingPortal,
    error,
  }
}
