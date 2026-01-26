/**
 * useEvents Hook
 *
 * Fetches and manages events from the D1 database.
 */

import { useState, useEffect, useCallback } from 'react'
import { listEvents, setEventRsvp, createCheckout, openExternalUrl, EventsListParams, SubscriptionInfo, SetEventRsvpResult } from '@/lib/api'
import type { EventWithRsvp, RsvpResponse } from '@/types/database'

export interface UseEventsParams {
  clubId: string
  from?: string
  to?: string
  status?: 'scheduled' | 'cancelled' | 'completed'
}

export interface RsvpConfirmation {
  eventId: string
  response: RsvpResponse
  teamName: string
  message: string
}

export interface UseEventsReturn {
  events: EventWithRsvp[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  rsvp: (eventId: string, response: RsvpResponse, confirmLateCancel?: boolean) => Promise<SetEventRsvpResult>
  rsvpLoading: string | null // Event ID currently being updated
  rsvpConfirmation: RsvpConfirmation | null // When user needs to confirm late cancellation
  clearRsvpConfirmation: () => void
  pay: (eventId: string) => Promise<void>
  payLoading: string | null // Event ID currently being processed for payment
  subscription: SubscriptionInfo | null
  memberType: 'member' | 'guest' | null
}

export function useEvents(params: UseEventsParams): UseEventsReturn {
  const [events, setEvents] = useState<EventWithRsvp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null)
  const [rsvpConfirmation, setRsvpConfirmation] = useState<RsvpConfirmation | null>(null)
  const [payLoading, setPayLoading] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [memberType, setMemberType] = useState<'member' | 'guest' | null>(null)

  const clearRsvpConfirmation = useCallback(() => {
    setRsvpConfirmation(null)
  }, [])

  const fetchEvents = useCallback(async () => {
    if (!params.clubId) {
      setEvents([])
      setSubscription(null)
      setMemberType(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const listParams: EventsListParams = {
        club_id: params.clubId,
        status: params.status || 'scheduled',
      }

      if (params.from) listParams.from = params.from
      if (params.to) listParams.to = params.to

      const response = await listEvents(listParams)
      setEvents(response.events)
      setSubscription(response.subscription)
      setMemberType(response.member_type)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load events'
      setError(message)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [params.clubId, params.from, params.to, params.status])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const rsvp = useCallback(async (eventId: string, response: RsvpResponse, confirmLateCancel?: boolean): Promise<SetEventRsvpResult> => {
    setRsvpLoading(eventId)

    try {
      const result = await setEventRsvp(eventId, {
        response,
        confirm_late_cancel: confirmLateCancel,
      })

      // If confirmation is required, store it and return
      if (result.requires_confirmation) {
        setRsvpConfirmation({
          eventId,
          response,
          teamName: result.team_name || 'a team',
          message: result.message || 'You are assigned to a team. Are you sure you want to decline?',
        })
        setRsvpLoading(null)
        return result
      }

      // Clear any existing confirmation
      setRsvpConfirmation(null)

      // Update local state optimistically
      setEvents((prev) =>
        prev.map((event) => {
          if (event.id !== eventId) return event

          // Update RSVP counts
          const oldRsvp = event.my_rsvp
          let { rsvp_yes_count, rsvp_no_count, rsvp_maybe_count } = event

          // Decrement old count
          if (oldRsvp === 'yes') rsvp_yes_count--
          else if (oldRsvp === 'no') rsvp_no_count--
          else if (oldRsvp === 'maybe') rsvp_maybe_count--

          // Increment new count
          if (response === 'yes') rsvp_yes_count++
          else if (response === 'no') rsvp_no_count++
          else if (response === 'maybe') rsvp_maybe_count++

          return {
            ...event,
            my_rsvp: response,
            rsvp_yes_count,
            rsvp_no_count,
            rsvp_maybe_count,
          }
        })
      )

      return result
    } catch (err) {
      // Refresh on error to get correct state
      await fetchEvents()
      throw err
    } finally {
      setRsvpLoading(null)
    }
  }, [fetchEvents])

  const pay = useCallback(async (eventId: string) => {
    setPayLoading(eventId)

    try {
      const response = await createCheckout(eventId)
      // Open Stripe Checkout (in-app browser on iOS)
      await openExternalUrl(response.checkout_url)
      setPayLoading(null)
    } catch (err) {
      setPayLoading(null)
      throw err
    }
  }, [])

  return {
    events,
    loading,
    error,
    refresh: fetchEvents,
    rsvp,
    rsvpLoading,
    rsvpConfirmation,
    clearRsvpConfirmation,
    pay,
    payLoading,
    subscription,
    memberType,
  }
}
