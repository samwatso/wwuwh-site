/**
 * useNetworkStatus Hook
 *
 * Detects online/offline status using browser APIs.
 * Works in both web and Capacitor contexts.
 */

import { useState, useEffect } from 'react'

export interface NetworkStatus {
  isOnline: boolean
  isOffline: boolean
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => {
    // Default to online if navigator.onLine is not available
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return {
    isOnline,
    isOffline: !isOnline,
  }
}
