/**
 * calendar-worker.js — Cloudflare Worker
 * Converts Google Calendar ICS feed to JSON for the WWUWH Events page.
 *
 * DEPLOYMENT:
 * 1. Create a new Cloudflare Worker in your dashboard
 * 2. Paste this code into the worker
 * 3. Configure a route to map /api/calendar.json to this worker
 *    e.g., wwuwh.co.uk/api/calendar.json -> calendar-worker
 *
 * The worker fetches the public ICS, parses VEVENT blocks, and returns JSON.
 * Results are cached at the edge for 5 minutes to avoid hammering Google.
 */

const ICS_URL = 'https://calendar.google.com/calendar/ical/wwickhamuwh%40gmail.com/public/basic.ics';
const CACHE_TTL = 300; // 5 minutes in seconds

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    // Check cache first
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;

    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }

    try {
      // Fetch ICS from Google
      const icsResponse = await fetch(ICS_URL, {
        headers: {
          'User-Agent': 'WWUWH-Calendar-Worker/1.0'
        }
      });

      if (!icsResponse.ok) {
        throw new Error(`ICS fetch failed: ${icsResponse.status}`);
      }

      const icsText = await icsResponse.text();

      // Parse ICS to events
      const events = parseICS(icsText);

      // Build response
      const data = {
        updated: new Date().toISOString(),
        events: events
      };

      response = new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          ...corsHeaders()
        }
      });

      // Store in cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;

    } catch (error) {
      console.error('Calendar worker error:', error);

      return new Response(JSON.stringify({
        error: 'Failed to fetch calendar',
        message: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }
  }
};

/**
 * CORS headers for cross-origin requests
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

/**
 * Parse ICS text into an array of event objects
 * Pragmatic parser - handles VEVENT blocks without heavy dependencies
 */
function parseICS(icsText) {
  const events = [];

  // Unfold long lines (ICS wraps at 75 chars with leading space/tab)
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');

  // Split into lines
  const lines = unfolded.split(/\r\n|\n|\r/);

  let currentEvent = null;
  let inEvent = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {
        id: null,
        title: '',
        location: null,
        start: null,
        end: null,
        allDay: false
      };
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (currentEvent && currentEvent.start) {
        events.push(currentEvent);
      }
      currentEvent = null;
      inEvent = false;
      continue;
    }

    if (!inEvent || !currentEvent) continue;

    // Parse property
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const propPart = trimmed.substring(0, colonIndex);
    const value = trimmed.substring(colonIndex + 1);

    // Extract property name (before any parameters like ;TZID=)
    const semiIndex = propPart.indexOf(';');
    const propName = semiIndex > -1 ? propPart.substring(0, semiIndex) : propPart;

    switch (propName) {
      case 'UID':
        currentEvent.id = value;
        break;

      case 'SUMMARY':
        currentEvent.title = unescapeICS(value);
        break;

      case 'LOCATION':
        currentEvent.location = unescapeICS(value) || null;
        break;

      case 'DTSTART':
        currentEvent.start = parseICSDate(value, propPart);
        // Check if all-day event (date only, no time)
        if (propPart.includes('VALUE=DATE') || value.length === 8) {
          currentEvent.allDay = true;
        }
        break;

      case 'DTEND':
        currentEvent.end = parseICSDate(value, propPart);
        break;
    }
  }

  // Sort by start date
  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  return events;
}

/**
 * Parse ICS date/datetime to ISO string
 * Handles formats:
 * - 20250115 (date only)
 * - 20250115T190000 (local datetime)
 * - 20250115T190000Z (UTC datetime)
 */
function parseICSDate(value, propPart) {
  // Clean the value
  const cleaned = value.trim();

  // Date only (all-day event)
  if (cleaned.length === 8) {
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6);
    const day = cleaned.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  // Datetime
  if (cleaned.length >= 15) {
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6);
    const day = cleaned.substring(6, 8);
    const hour = cleaned.substring(9, 11);
    const minute = cleaned.substring(11, 13);
    const second = cleaned.substring(13, 15);

    let isoStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    // Check for UTC marker
    if (cleaned.endsWith('Z')) {
      isoStr += 'Z';
    } else {
      // Try to extract timezone from property parameters
      const tzMatch = propPart.match(/TZID=([^;:]+)/);
      if (tzMatch) {
        // For simplicity, assume Europe/London for the club
        // A more robust solution would use a timezone library
        isoStr += '+00:00'; // Approximate, DST not handled
      }
    }

    return isoStr;
  }

  // Fallback
  return value;
}

/**
 * Unescape ICS special characters
 */
function unescapeICS(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}