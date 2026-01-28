/**
 * Cloudflare Pages Functions Middleware
 * Adds security headers to all responses
 */

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

export const onRequest: PagesFunction = async (context) => {
  // Process the request
  const response = await context.next()

  // Clone the response to modify headers
  const newResponse = new Response(response.body, response)

  // Add security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value)
  }

  return newResponse
}
