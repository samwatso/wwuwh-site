/**
 * useCountdown Hook
 *
 * Returns a countdown string that updates every 60 seconds.
 * Format: "Starts in 3d 4h 12m" or "Starting soon" if less than 1 minute.
 */

import { useState, useEffect, useCallback } from 'react'

interface CountdownResult {
  days: number
  hours: number
  minutes: number
  text: string
  isStarted: boolean
}

function calculateCountdown(targetDate: Date): CountdownResult {
  const now = new Date()
  const diff = targetDate.getTime() - now.getTime()

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, text: 'Started', isStarted: true }
  }

  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60

  // Build text
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (remainingHours > 0 || days > 0) parts.push(`${remainingHours}h`)
  parts.push(`${remainingMinutes}m`)

  const text = parts.length > 0 ? `Starts in ${parts.join(' ')}` : 'Starting soon'

  return {
    days,
    hours: remainingHours,
    minutes: remainingMinutes,
    text,
    isStarted: false,
  }
}

export function useCountdown(targetDate: Date | string | null): CountdownResult | null {
  const [countdown, setCountdown] = useState<CountdownResult | null>(() => {
    if (!targetDate) return null
    const date = typeof targetDate === 'string' ? new Date(targetDate) : targetDate
    return calculateCountdown(date)
  })

  const updateCountdown = useCallback(() => {
    if (!targetDate) {
      setCountdown(null)
      return
    }
    const date = typeof targetDate === 'string' ? new Date(targetDate) : targetDate
    setCountdown(calculateCountdown(date))
  }, [targetDate])

  useEffect(() => {
    updateCountdown()

    // Update every 60 seconds
    const interval = setInterval(updateCountdown, 60 * 1000)

    return () => clearInterval(interval)
  }, [updateCountdown])

  return countdown
}
