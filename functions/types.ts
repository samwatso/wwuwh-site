/**
 * Cloudflare Pages Functions Environment Types
 */

export interface Env {
  // D1 Database binding (matches Cloudflare Pages variable name)
  WWUWH_DB: D1Database

  // Environment variables (set in Cloudflare Pages dashboard)
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SUPABASE_JWT_SECRET?: string  // For JWT signature verification

  // Stripe
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PUBLISHABLE_KEY?: string

  // Apple Push Notifications (APNs)
  APNS_KEY_ID?: string          // Key ID from Apple Developer Portal
  APNS_TEAM_ID?: string         // Your Apple Developer Team ID
  APNS_PRIVATE_KEY?: string     // Private key content (base64 encoded)
  APNS_BUNDLE_ID?: string       // App bundle ID (e.g., com.wwuwh.app)
}

/**
 * Extended context with typed environment
 */
export type ApiContext = EventContext<Env, string, Record<string, unknown>>

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  timestamp: string
}

/**
 * Create a JSON response with standard format
 */
export function jsonResponse<T>(
  data: T,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      ok: status >= 200 && status < 300,
      data,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  )
}

/**
 * Create an error response
 */
export function errorResponse(
  message: string,
  status = 500,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  )
}
