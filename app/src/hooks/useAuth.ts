import { useState, useEffect, useCallback } from 'react'
import { User, Session, AuthError, AuthChangeEvent } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

export interface UseAuthReturn extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  // TODO: STAGE 5+ - Add magic link support
  // signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  })

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
      })
    })

    // Listen for auth changes (includes automatic token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      // Log auth events in development for debugging
      if (import.meta.env.DEV) {
        console.log('[Auth]', event, session?.user?.email ?? 'no user')
      }

      setState({
        user: session?.user ?? null,
        session,
        loading: false,
      })

      // Handle specific events
      if (event === 'SIGNED_OUT') {
        // Clear any cached data when user signs out
        // TODO: STAGE 4+ - Clear cached profile/membership data
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Redirect to app after email confirmation
        emailRedirectTo: `${window.location.origin}/app`,
      },
    })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      console.error('[Auth] Sign out error:', error.message)
    }
    // Clear state immediately to ensure UI updates
    setState({
      user: null,
      session: null,
      loading: false,
    })
  }, [])

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      console.error('[Auth] Failed to refresh session:', error.message)
      // If refresh fails, sign out to force re-authentication
      await supabase.auth.signOut()
    } else if (data.session) {
      setState({
        user: data.session.user,
        session: data.session,
        loading: false,
      })
    }
  }, [])

  return {
    ...state,
    signIn,
    signUp,
    signOut,
    refreshSession,
  }
}
