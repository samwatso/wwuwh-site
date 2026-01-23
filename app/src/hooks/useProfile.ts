/**
 * useProfile Hook
 *
 * Manages the user's D1 profile (people table).
 * On first load, ensures a profile exists by calling POST /api/me.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import { getMyProfile, ensureProfile, updateProfile, ClubMembershipWithName, ClubMemberRoleWithName, MemberSubscriptionWithPlan } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Person } from '@/types/database'

export interface ProfileState {
  person: Person | null
  memberships: ClubMembershipWithName[]
  roles: ClubMemberRoleWithName[]
  subscriptions: MemberSubscriptionWithPlan[]
  loading: boolean
  error: string | null
  synced: boolean // true once profile is confirmed in D1
}

export interface UseProfileReturn extends ProfileState {
  refresh: () => Promise<void>
  updateName: (name: string) => Promise<void>
  updatePhoto: (photoUrl: string | null) => Promise<void>
  updateEmail: (email: string) => Promise<{ success: boolean; message?: string }>
}

export function useProfile(): UseProfileReturn {
  const { user, loading: authLoading } = useAuth()

  const [state, setState] = useState<ProfileState>({
    person: null,
    memberships: [],
    roles: [],
    subscriptions: [],
    loading: true,
    error: null,
    synced: false,
  })

  // Fetch or create profile when user is authenticated
  const syncProfile = useCallback(async () => {
    if (!user) {
      setState({
        person: null,
        memberships: [],
        roles: [],
        subscriptions: [],
        loading: false,
        error: null,
        synced: false,
      })
      return
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      // First, try to get existing profile
      const response = await getMyProfile()
      setState({
        person: response.person,
        memberships: response.memberships || [],
        roles: response.roles || [],
        subscriptions: response.subscriptions || [],
        loading: false,
        error: null,
        synced: true,
      })
    } catch (error) {
      // If 404, profile doesn't exist yet - create it
      if (error instanceof Error && error.message.includes('not found')) {
        try {
          const response = await ensureProfile()
          setState({
            person: response.person,
            memberships: response.memberships || [],
            roles: response.roles || [],
            subscriptions: response.subscriptions || [],
            loading: false,
            error: null,
            synced: true,
          })

          if (response.created) {
            console.log('[Profile] Created new profile for', user.email)
          }
        } catch (createError) {
          const message =
            createError instanceof Error
              ? createError.message
              : 'Failed to create profile'
          setState({
            person: null,
            memberships: [],
            roles: [],
            subscriptions: [],
            loading: false,
            error: message,
            synced: false,
          })
        }
      } else {
        // Other error
        const message =
          error instanceof Error ? error.message : 'Failed to load profile'
        setState({
          person: null,
          memberships: [],
          roles: [],
          subscriptions: [],
          loading: false,
          error: message,
          synced: false,
        })
      }
    }
  }, [user])

  // Sync profile when auth state changes
  useEffect(() => {
    if (!authLoading) {
      syncProfile()
    }
  }, [authLoading, syncProfile])

  // Manual refresh
  const refresh = useCallback(async () => {
    await syncProfile()
  }, [syncProfile])

  // Update profile name
  const updateName = useCallback(
    async (name: string) => {
      if (!user) return

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const response = await ensureProfile(name)
        setState({
          person: response.person,
          memberships: response.memberships || [],
          roles: response.roles || [],
          subscriptions: response.subscriptions || [],
          loading: false,
          error: null,
          synced: true,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update profile'
        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }))
      }
    },
    [user]
  )

  // Update profile photo
  const updatePhoto = useCallback(
    async (photoUrl: string | null) => {
      if (!user) return

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const response = await updateProfile({ photo_url: photoUrl })
        setState({
          person: response.person,
          memberships: response.memberships || [],
          roles: response.roles || [],
          subscriptions: response.subscriptions || [],
          loading: false,
          error: null,
          synced: true,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update photo'
        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }))
      }
    },
    [user]
  )

  // Update email (Supabase Auth + D1)
  const updateEmail = useCallback(
    async (email: string): Promise<{ success: boolean; message?: string }> => {
      if (!user) return { success: false, message: 'Not authenticated' }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        // First update Supabase Auth
        const { error: authError } = await supabase.auth.updateUser({ email })

        if (authError) {
          throw authError
        }

        // Then update D1 database
        const response = await updateProfile({ email })
        setState({
          person: response.person,
          memberships: response.memberships || [],
          roles: response.roles || [],
          subscriptions: response.subscriptions || [],
          loading: false,
          error: null,
          synced: true,
        })

        return {
          success: true,
          message: 'A confirmation email has been sent to your new address. Please check your inbox.',
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update email'
        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }))
        return { success: false, message }
      }
    },
    [user]
  )

  return {
    ...state,
    refresh,
    updateName,
    updatePhoto,
    updateEmail,
  }
}
