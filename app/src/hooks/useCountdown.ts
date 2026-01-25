/**
 * useCountdown Hook
 *
 * Returns a countdown string that updates every second.
 * Format: "Starts in 3d 4h 12m 30s" with live seconds.
 */

import { useState, useEffect, useCallback } from 'react'

interface CountdownResult {
  days: number
  hours: number
  minutes: number
  seconds: number
  text: string
  isStarted: boolean
}

function calculateCountdown(targetDate: Date): CountdownResult {
  const now = new Date()
  const diff = targetDate.getTime() - now.getTime()

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, text: 'Started', isStarted: true }
  }

  const totalSeconds = Math.floor(diff / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)

  // Build text
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  const text = `Starts in ${parts.join(' ')}`

  return {
    days,
    hours,
    minutes,
    seconds,
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

    // Update every second for live countdown
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [updateCountdown])

  return countdown
}
