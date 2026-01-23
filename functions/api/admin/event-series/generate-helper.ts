/**
 * Event Generation Helper
 * Generates individual events from a series template
 */

// Weekday bitmask values (matching JavaScript's Date.getDay())
export const WEEKDAY_BITS = {
  Sun: 1,   // 0
  Mon: 2,   // 1
  Tue: 4,   // 2
  Wed: 8,   // 3
  Thu: 16,  // 4
  Fri: 32,  // 5
  Sat: 64,  // 6
} as const

// Map JS day index to bit value
const DAY_TO_BIT = [1, 2, 4, 8, 16, 32, 64] // Sun=0 to Sat=6

export interface GenerateEventsParams {
  seriesId: string
  clubId: string
  title: string
  description: string | null
  location: string | null
  weekdayMask: number
  startTimeLocal: string // "HH:MM" format
  durationMin: number
  startDate: string // "YYYY-MM-DD" format
  endDate: string | null
  visibilityDays: number
  feeCents: number | null
  currency: string
  paymentMode: 'included' | 'one_off' | 'free'
  generateWeeks: number
  createdByPersonId: string
  fromDate?: string // Optional: start generating from this date instead of startDate
}

/**
 * Generate events from a series template
 * Returns the number of events created
 */
export async function generateEventsFromSeries(
  db: D1Database,
  params: GenerateEventsParams
): Promise<number> {
  const {
    seriesId,
    clubId,
    title,
    description,
    location,
    weekdayMask,
    startTimeLocal,
    durationMin,
    startDate,
    endDate,
    visibilityDays,
    feeCents,
    currency,
    paymentMode,
    generateWeeks,
    createdByPersonId,
    fromDate,
  } = params

  // Determine date range
  const rangeStart = fromDate ? new Date(fromDate) : new Date(startDate)
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + generateWeeks * 7)

  // If series has an end date, don't generate past it
  const seriesEnd = endDate ? new Date(endDate) : null
  if (seriesEnd && rangeEnd > seriesEnd) {
    rangeEnd.setTime(seriesEnd.getTime())
  }

  // Don't generate events in the past
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (rangeStart < today) {
    rangeStart.setTime(today.getTime())
  }

  // Get existing events for this series to avoid duplicates
  const existingEvents = await db
    .prepare(`
      SELECT starts_at_utc FROM events
      WHERE series_id = ?
        AND starts_at_utc >= ?
    `)
    .bind(seriesId, rangeStart.toISOString())
    .all<{ starts_at_utc: string }>()

  const existingDates = new Set(
    existingEvents.results.map(e => e.starts_at_utc.split('T')[0])
  )

  // Parse start time
  const [hours, minutes] = startTimeLocal.split(':').map(Number)

  // Generate events for each matching weekday
  const eventsToCreate: Array<{
    id: string
    startsAt: string
    endsAt: string
    visibleFrom: string
  }> = []

  const currentDate = new Date(rangeStart)
  while (currentDate <= rangeEnd) {
    const dayOfWeek = currentDate.getDay() // 0 = Sunday, 6 = Saturday
    const dayBit = DAY_TO_BIT[dayOfWeek]

    // Check if this weekday is in the mask
    if ((weekdayMask & dayBit) !== 0) {
      // Build the event datetime (assuming local time = Europe/London for now)
      // In a real app, you'd want proper timezone handling
      const eventDate = new Date(currentDate)
      eventDate.setHours(hours, minutes, 0, 0)

      const dateStr = eventDate.toISOString().split('T')[0]

      // Skip if event already exists for this date
      if (!existingDates.has(dateStr)) {
        const startsAt = eventDate.toISOString()
        const endsAt = new Date(eventDate.getTime() + durationMin * 60 * 1000).toISOString()
        const visibleFrom = new Date(eventDate.getTime() - visibilityDays * 24 * 60 * 60 * 1000).toISOString()

        eventsToCreate.push({
          id: crypto.randomUUID(),
          startsAt,
          endsAt,
          visibleFrom,
        })
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Batch insert events
  for (const event of eventsToCreate) {
    await db
      .prepare(`
        INSERT INTO events (
          id, club_id, series_id, title, description, location,
          kind, starts_at_utc, ends_at_utc, timezone,
          payment_mode, fee_cents, currency, visible_from,
          created_by_person_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'session', ?, ?, 'Europe/London', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .bind(
        event.id,
        clubId,
        seriesId,
        title,
        description,
        location,
        event.startsAt,
        event.endsAt,
        paymentMode,
        feeCents,
        currency,
        event.visibleFrom,
        createdByPersonId
      )
      .run()

    // Copy series invitations to the new event
    await db
      .prepare(`
        INSERT INTO event_invitations (id, event_id, person_id, group_id, invited_by_person_id, created_at)
        SELECT lower(hex(randomblob(16))), ?, person_id, group_id, invited_by_person_id, datetime('now')
        FROM series_invitations
        WHERE series_id = ?
      `)
      .bind(event.id, seriesId)
      .run()
  }

  return eventsToCreate.length
}

/**
 * Get weekday names from a bitmask
 */
export function getWeekdayNames(mask: number): string[] {
  const days: string[] = []
  if (mask & WEEKDAY_BITS.Sun) days.push('Sunday')
  if (mask & WEEKDAY_BITS.Mon) days.push('Monday')
  if (mask & WEEKDAY_BITS.Tue) days.push('Tuesday')
  if (mask & WEEKDAY_BITS.Wed) days.push('Wednesday')
  if (mask & WEEKDAY_BITS.Thu) days.push('Thursday')
  if (mask & WEEKDAY_BITS.Fri) days.push('Friday')
  if (mask & WEEKDAY_BITS.Sat) days.push('Saturday')
  return days
}

/**
 * Get short weekday names from a bitmask
 */
export function getWeekdayShortNames(mask: number): string[] {
  const days: string[] = []
  if (mask & WEEKDAY_BITS.Sun) days.push('Sun')
  if (mask & WEEKDAY_BITS.Mon) days.push('Mon')
  if (mask & WEEKDAY_BITS.Tue) days.push('Tue')
  if (mask & WEEKDAY_BITS.Wed) days.push('Wed')
  if (mask & WEEKDAY_BITS.Thu) days.push('Thu')
  if (mask & WEEKDAY_BITS.Fri) days.push('Fri')
  if (mask & WEEKDAY_BITS.Sat) days.push('Sat')
  return days
}
