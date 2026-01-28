/**
 * Cloudflare Pages Functions Middleware
 * Adds security headers to all responses
 */

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

// CSP for static marketing site
const STATIC_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://wwuwh-calendar.sammartinwatson.workers.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

// CSP for React app with Supabase, Stripe, etc.
const APP_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://formspree.io; frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://formspree.io"

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next()
  const newResponse = new Response(response.body, response)

  // Add security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value)
  }

  // Add appropriate CSP based on path
  const url = new URL(context.request.url)
  if (url.pathname.startsWith('/app')) {
    newResponse.headers.set('Content-Security-Policy', APP_CSP)
  } else {
    newResponse.headers.set('Content-Security-Policy', STATIC_CSP)
  }

  return newResponse
}
