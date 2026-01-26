/**
 * API CORS Middleware
 * Handles CORS preflight requests and adds headers for cross-origin requests
 * Required for Capacitor iOS app which makes requests from capacitor://localhost
 */

import { Env } from '../types'

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://wwuwh.com',
  'https://www.wwuwh.com',
  'capacitor://localhost',  // iOS Capacitor
  'http://localhost',       // iOS Capacitor (alternative)
  'https://localhost',      // Android Capacitor
  'http://localhost:5173',  // Local dev
  'http://localhost:3000',  // Local dev alternative
]

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || ''

  // Check if origin is allowed
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    })
  }

  // Continue to the actual handler
  const response = await context.next()

  // Clone response and add CORS headers
  const newResponse = new Response(response.body, response)
  const corsHeaders = getCorsHeaders(request)

  for (const [key, value] of Object.entries(corsHeaders)) {
    newResponse.headers.set(key, value)
  }

  return newResponse
}
