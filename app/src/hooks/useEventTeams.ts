/**
 * useEventTeams Hook
 *
 * Fetches and manages team assignments for an event.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getEventTeams,
  createEventTeams,
  updateTeamAssignments,
  removeTeamAssignment,
  EventTeamsResponse,
  TeamWithAssignments,
  TeamAssignment,
  AvailablePlayer,
  AssignmentUpdate,
} from '@/lib/api'

export interface UseEventTeamsParams {
  eventId: string
  clubId: string
}

export interface UseEventTeamsReturn {
  // Data
  event: EventTeamsResponse['event'] | null
  teams: TeamWithAssignments[]
  unassigned: TeamAssignment[]
  availablePlayers: AvailablePlayer[]
  totalAssigned: number
  totalRsvpYes: number

  // State
  loading: boolean
  error: string | null
  saving: boolean

  // Actions
  refresh: () => Promise<void>
  createTeams: (teams: Array<{ id?: string; name: string; sort_order?: number }>) => Promise<void>
  updateAssignments: (assignments: AssignmentUpdate[]) => Promise<void>
  removeAssignment: (personId: string) => Promise<void>
}

export function useEventTeams(params: UseEventTeamsParams): UseEventTeamsReturn {
  const { eventId, clubId } = params

  const [event, setEvent] = useState<EventTeamsResponse['event'] | null>(null)
  const [teams, setTeams] = useState<TeamWithAssignments[]>([])
  const [unassigned, setUnassigned] = useState<TeamAssignment[]>([])
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([])
  const [totalAssigned, setTotalAssigned] = useState(0)
  const [totalRsvpYes, setTotalRsvpYes] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchTeams = useCallback(async () => {
    if (!eventId || !clubId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getEventTeams(eventId, clubId)
      setEvent(response.event)
      setTeams(response.teams)
      setUnassigned(response.unassigned)
      setAvailablePlayers(response.available_players)
      setTotalAssigned(response.total_assigned)
      setTotalRsvpYes(response.total_rsvp_yes)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load teams'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [eventId, clubId])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  const createTeams = useCallback(
    async (newTeams: Array<{ id?: string; name: string; sort_order?: number }>) => {
      if (!eventId || !clubId) return

      setSaving(true)
      try {
        await createEventTeams(eventId, {
          club_id: clubId,
          teams: newTeams,
        })
        await fetchTeams() // Refresh to get updated data
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create teams'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [eventId, clubId, fetchTeams]
  )

  const updateAssignments = useCallback(
    async (assignments: AssignmentUpdate[]) => {
      if (!eventId || !clubId) return

      setSaving(true)
      try {
        await updateTeamAssignments(eventId, {
          club_id: clubId,
          assignments,
        })
        await fetchTeams() // Refresh to get updated data
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update assignments'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [eventId, clubId, fetchTeams]
  )

  const removeAssignment = useCallback(
    async (personId: string) => {
      if (!eventId || !clubId) return

      setSaving(true)
      try {
        await removeTeamAssignment(eventId, clubId, personId)
        await fetchTeams() // Refresh to get updated data
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove assignment'
        throw new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [eventId, clubId, fetchTeams]
  )

  return {
    event,
    teams,
    unassigned,
    availablePlayers,
    totalAssigned,
    totalRsvpYes,
    loading,
    error,
    saving,
    refresh: fetchTeams,
    createTeams,
    updateAssignments,
    removeAssignment,
  }
}
