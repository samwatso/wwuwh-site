/**
 * ICS (iCalendar) file generation utilities
 */

interface ICSEvent {
  title: string
  description?: string | null
  location?: string | null
  start: string // ISO date string
  end: string // ISO date string
  id?: string
}

/**
 * Escape special characters for ICS format
 */
function escapeICS(str: string): string {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * Format a Date to ICS datetime format (UTC)
 * Format: YYYYMMDDTHHMMSSZ
 */
function formatICSDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

/**
 * Generate a UID for an event
 */
function generateUID(event: ICSEvent): string {
  if (event.id) return `${event.id}@wwuwh.com`
  const base = `${event.title}-${event.start}`.replace(/[^a-zA-Z0-9]/g, '')
  return `${base}-${Date.now()}@wwuwh.com`
}

/**
 * Create a slug from event title for filename
 */
export function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

/**
 * Generate ICS content for a single event
 */
export function generateICS(event: ICSEvent): string {
  const uid = escapeICS(generateUID(event))
  const dtstamp = formatICSDate(new Date())
  const dtstart = formatICSDate(new Date(event.start))
  const dtend = formatICSDate(new Date(event.end))
  const summary = escapeICS(event.title)
  const location = event.location ? `LOCATION:${escapeICS(event.location)}` : null
  const description = event.description ? `DESCRIPTION:${escapeICS(event.description)}` : null

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//West Wickham UWH//Members App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    location,
    description,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)

  return lines.join('\r\n')
}

/**
 * Download ICS file for an event
 */
export function downloadICS(event: ICSEvent): void {
  const icsContent = generateICS(event)
  const slug = createSlug(event.title)
  const filename = `wwuwh-${slug}.ics`

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 100)
}

/**
 * Calendar subscription URLs
 */
export const CALENDAR_URLS = {
  // webcal:// protocol opens native calendar apps
  webcal: 'webcal://calendar.google.com/calendar/ical/wwickhamuwh%40gmail.com/public/basic.ics',
  // Google Calendar add subscription
  google: 'https://calendar.google.com/calendar/render?cid=wwickhamuwh%40gmail.com',
}
