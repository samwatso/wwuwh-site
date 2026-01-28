/**
 * usePushNotifications Hook
 *
 * Handles push notification registration and permissions for iOS.
 * Registers device token with backend when user is authenticated.
 */

import { useEffect, useCallback, useState } from 'react'
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useAuth } from './useAuth'

// API function to register device token
async function registerDeviceToken(token: string, platform: string): Promise<void> {
  const API_BASE = Capacitor.isNativePlatform()
    ? 'https://wwuwh.com/api'
    : '/api'

  // Get auth token from Supabase
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    console.log('No auth session, skipping token registration')
    return
  }

  const response = await fetch(`${API_BASE}/push/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ token, platform }),
  })

  if (!response.ok) {
    throw new Error('Failed to register device token')
  }
}

export interface UsePushNotificationsReturn {
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unknown'
  requestPermission: () => Promise<void>
  isSupported: boolean
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth()
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown')
  const isSupported = Capacitor.isNativePlatform()

  // Function to check and update permission status
  const checkPermissionStatus = useCallback(async () => {
    if (!isSupported) return

    console.log('[Push] Checking permission status...')
    const result = await PushNotifications.checkPermissions()
    console.log('[Push] Permission result:', result.receive)

    if (result.receive === 'granted') {
      setPermissionStatus('granted')
    } else if (result.receive === 'denied') {
      setPermissionStatus('denied')
    } else {
      setPermissionStatus('prompt')
    }
  }, [isSupported])

  // Check permission status on mount
  useEffect(() => {
    checkPermissionStatus()
  }, [checkPermissionStatus])

  // Re-check permission when app comes to foreground (user may have changed in Settings)
  useEffect(() => {
    if (!isSupported) return

    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[Push] App became active, re-checking permissions...')
        checkPermissionStatus()
      }
    })

    return () => {
      listener.then(l => l.remove())
    }
  }, [isSupported, checkPermissionStatus])

  // Set up notification listeners
  useEffect(() => {
    if (!isSupported) return

    // Handle successful registration
    const registrationListener = PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value)
      try {
        // Detect platform: 'ios' for APNs, 'android' for FCM
        const platform = Capacitor.getPlatform()
        await registerDeviceToken(token.value, platform)
        console.log(`Device token registered with backend for ${platform}`)
      } catch (err) {
        console.error('Failed to register token with backend:', err)
      }
    })

    // Handle registration errors
    const errorListener = PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error)
    })

    // Handle incoming notifications when app is in foreground
    const notificationListener = PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received:', notification)
      // Could show an in-app toast/alert here
    })

    // Handle notification tap (when user taps notification)
    const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('Push notification action performed:', action)
      // Could navigate to specific screen based on action.notification.data
    })

    return () => {
      registrationListener.then(l => l.remove())
      errorListener.then(l => l.remove())
      notificationListener.then(l => l.remove())
      actionListener.then(l => l.remove())
    }
  }, [isSupported])

  // Auto-register when user is authenticated and permission granted
  useEffect(() => {
    if (!isSupported || !user || permissionStatus !== 'granted') return

    console.log('[Push] Auto-registering for push notifications...')
    PushNotifications.register()
  }, [isSupported, user, permissionStatus])

  // Request permission
  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      console.log('[Push] Not supported on this platform')
      return
    }

    console.log('[Push] Requesting permission...')
    const result = await PushNotifications.requestPermissions()
    console.log('[Push] Permission request result:', result.receive)

    if (result.receive === 'granted') {
      setPermissionStatus('granted')
      // Register for push notifications
      console.log('[Push] Permission granted, registering...')
      await PushNotifications.register()
      console.log('[Push] Registration called')
    } else {
      console.log('[Push] Permission denied or not granted')
      setPermissionStatus('denied')
    }
  }, [isSupported])

  return {
    permissionStatus,
    requestPermission,
    isSupported,
  }
}
