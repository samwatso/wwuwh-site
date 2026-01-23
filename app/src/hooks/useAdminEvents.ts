/**
 * useAdminEvents Hook
 *
 * Manages events and series for admin view.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getAdminEvents,
  createAdminEvent,
  updateAdminEvent,
  deleteAdminEvent,
  getEventSeries,
  createEventSeries,
  updateEventSeries,
  deleteEventSeries,
  generateSeriesEvents,
  AdminEvent,
  EventSeries,
  CreateEventRequest,
  UpdateEventRequest,
  CreateSeriesRequest,
  UpdateSeriesRequest,
  GenerateEventsRequest,
} from '@/lib/api'

export interface UseAdminEventsParams {
  clubId: string
}

export interface UseAdminEventsReturn {
  // Events
  events: AdminEvent[]
  eventsLoading: boolean
  eventsError: string | null
  refreshEvents: () => Promise<void>
  createEvent: (request: Omit<CreateEventRequest, 'club_id'>) => Promise<AdminEvent>
  updateEvent: (eventId: string, request: Omit<UpdateEventRequest, 'club_id'>) => Promise<AdminEvent>
  cancelEvent: (eventId: string) => Promise<void>
  deleteEvent: (eventId: string) => Promise<void>

  // Series
  series: EventSeries[]
  seriesLoading: boolean
  seriesError: string | null
  refreshSeries: () => Promise<void>
  createSeries: (request: Omit<CreateSeriesRequest, 'club_id'>) => Promise<{ series: EventSeries; eventsCreated: number }>
  updateSeries: (seriesId: string, request: Omit<UpdateSeriesRequest, 'club_id'>) => Promise<EventSeries>
  archiveSeries: (seriesId: string) => Promise<void>
  deleteSeries: (seriesId: string) => Promise<void>
  generateEvents: (seriesId: string, weeks?: number) => Promise<number>

  // General
  saving: boolean
}

export function useAdminEvents(params: UseAdminEventsParams): UseAdminEventsReturn {
  const { clubId } = params

  const [events, setEvents] = useState<AdminEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [series, setSeries] = useState<EventSeries[]>([])
  const [seriesLoading, setSeriesLoading] = useState(true)
  const [seriesError, setSeriesError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  // Fetch events
  const fetchEvents = useCallback(async () => {
    if (!clubId) {
      setEventsLoading(false)
      return
    }

    setEventsLoading(true)
    setEventsError(null)

    try {
      const response = await getAdminEvents({ club_id: clubId })
      setEvents(response.events)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load events'
      setEventsError(message)
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }, [clubId])

  // Fetch series
  const fetchSeries = useCallback(async () => {
    if (!clubId) {
      setSeriesLoading(false)
      return
    }

    setSeriesLoading(true)
    setSeriesError(null)

    try {
      const response = await getEventSeries(clubId)
      setSeries(response.series)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load series'
      setSeriesError(message)
      setSeries([])
    } finally {
      setSeriesLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    fetchEvents()
    fetchSeries()
  }, [fetchEvents, fetchSeries])

  // Event CRUD
  const createEvent = useCallback(
    async (request: Omit<CreateEventRequest, 'club_id'>): Promise<AdminEvent> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const response = await createAdminEvent({ ...request, club_id: clubId })
        await fetchEvents()
        return response.event
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchEvents]
  )

  const updateEvent = useCallback(
    async (eventId: string, request: Omit<UpdateEventRequest, 'club_id'>): Promise<AdminEvent> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const response = await updateAdminEvent(eventId, { ...request, club_id: clubId })
        await fetchEvents()
        return response.event
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchEvents]
  )

  const cancelEvent = useCallback(
    async (eventId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await deleteAdminEvent(eventId, clubId, false)
        await fetchEvents()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchEvents]
  )

  const deleteEvent = useCallback(
    async (eventId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await deleteAdminEvent(eventId, clubId, true)
        await fetchEvents()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchEvents]
  )

  // Series CRUD
  const createSeriesFn = useCallback(
    async (request: Omit<CreateSeriesRequest, 'club_id'>): Promise<{ series: EventSeries; eventsCreated: number }> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const response = await createEventSeries({ ...request, club_id: clubId })
        await fetchSeries()
        await fetchEvents()
        return { series: response.series, eventsCreated: response.events_created }
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchSeries, fetchEvents]
  )

  const updateSeriesFn = useCallback(
    async (seriesId: string, request: Omit<UpdateSeriesRequest, 'club_id'>): Promise<EventSeries> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const response = await updateEventSeries(seriesId, { ...request, club_id: clubId })
        await fetchSeries()
        return response.series
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchSeries]
  )

  const archiveSeries = useCallback(
    async (seriesId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await deleteEventSeries(seriesId, clubId, false)
        await fetchSeries()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchSeries]
  )

  const deleteSeriesFn = useCallback(
    async (seriesId: string): Promise<void> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        await deleteEventSeries(seriesId, clubId, true)
        await fetchSeries()
        await fetchEvents()
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchSeries, fetchEvents]
  )

  const generateEventsFn = useCallback(
    async (seriesId: string, weeks?: number): Promise<number> => {
      if (!clubId) throw new Error('No club selected')

      setSaving(true)
      try {
        const request: GenerateEventsRequest = { club_id: clubId }
        if (weeks) request.weeks = weeks
        const response = await generateSeriesEvents(seriesId, request)
        await fetchSeries()
        await fetchEvents()
        return response.events_created
      } finally {
        setSaving(false)
      }
    },
    [clubId, fetchSeries, fetchEvents]
  )

  return {
    events,
    eventsLoading,
    eventsError,
    refreshEvents: fetchEvents,
    createEvent,
    updateEvent,
    cancelEvent,
    deleteEvent,

    series,
    seriesLoading,
    seriesError,
    refreshSeries: fetchSeries,
    createSeries: createSeriesFn,
    updateSeries: updateSeriesFn,
    archiveSeries,
    deleteSeries: deleteSeriesFn,
    generateEvents: generateEventsFn,

    saving,
  }
}
