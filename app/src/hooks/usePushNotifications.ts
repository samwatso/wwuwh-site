/**
 * usePushNotifications Hook
 *
 * Handles push notification registration and permissions for iOS.
 * Registers device token with backend when user is authenticated.
 */

import { useEffect, useCallback, useState } from 'react'
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
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

  // Check current permission status
  useEffect(() => {
    if (!isSupported) return

    PushNotifications.checkPermissions().then(result => {
      if (result.receive === 'granted') {
        setPermissionStatus('granted')
      } else if (result.receive === 'denied') {
        setPermissionStatus('denied')
      } else {
        setPermissionStatus('prompt')
      }
    })
  }, [isSupported])

  // Set up notification listeners
  useEffect(() => {
    if (!isSupported) return

    // Handle successful registration
    const registrationListener = PushNotifications.addListener('registration', async (token: Token) => {
      console.log('Push registration success, token:', token.value)
      try {
        await registerDeviceToken(token.value, 'ios')
        console.log('Device token registered with backend')
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

    PushNotifications.register()
  }, [isSupported, user, permissionStatus])

  // Request permission
  const requestPermission = useCallback(async () => {
    if (!isSupported) return

    const result = await PushNotifications.requestPermissions()

    if (result.receive === 'granted') {
      setPermissionStatus('granted')
      // Register for push notifications
      await PushNotifications.register()
    } else {
      setPermissionStatus('denied')
    }
  }, [isSupported])

  return {
    permissionStatus,
    requestPermission,
    isSupported,
  }
}
