/**
 * Auth Middleware for API Routes
 *
 * Verifies Supabase JWT tokens using HMAC-SHA256 signature verification
 * and extracts user information. Add this to protected routes to require authentication.
 */

import { Env, errorResponse } from '../types'

export interface AuthUser {
  id: string        // Supabase auth.users.id
  email: string
  role: string      // 'authenticated' | 'anon'
}

export interface AuthContext {
  user: AuthUser
}

/**
 * Base64URL decode (handles JWT's URL-safe base64)
 */
function base64UrlDecode(str: string): Uint8Array {
  // Convert base64url to base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Pad if necessary
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  // Decode
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Base64URL encode
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Verify JWT signature using HMAC-SHA256
 */
async function verifySignature(
  token: string,
  secret: string
): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return false
  }

  const [header, payload, signature] = parts
  const signatureInput = `${header}.${payload}`

  try {
    // Import the secret key for HMAC-SHA256
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    // Sign the header.payload
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signatureInput)
    )

    // Compare signatures using constant-time comparison
    const expectedSignature = base64UrlEncode(signatureBuffer)
    return constantTimeCompare(expectedSignature, signature)
  } catch {
    return false
  }
}

/**
 * Verify a Supabase JWT token
 *
 * This function:
 * 1. Verifies the HMAC-SHA256 signature using SUPABASE_JWT_SECRET
 * 2. Checks token expiration
 * 3. Validates required claims (sub, email)
 * 4. Returns the authenticated user info
 */
export async function verifyToken(
  token: string,
  env: Env
): Promise<AuthUser | null> {
  try {
    // Split JWT into parts
    const parts = token.split('.')
    if (parts.length !== 3) {
      console.error('JWT: Invalid format - expected 3 parts')
      return null
    }

    // Verify signature if secret is configured
    const jwtSecret = env.SUPABASE_JWT_SECRET
    if (jwtSecret) {
      const isValid = await verifySignature(token, jwtSecret)
      if (!isValid) {
        console.error('JWT: Signature verification failed')
        return null
      }
    } else {
      // Log warning in development, but don't fail
      // In production, SUPABASE_JWT_SECRET should always be set
      console.warn('JWT: SUPABASE_JWT_SECRET not configured - signature not verified')
    }

    // Decode payload
    const payloadBytes = base64UrlDecode(parts[1])
    const payloadText = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadText)

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      console.error('JWT: Token expired')
      return null
    }

    // Check not-before time (nbf)
    if (payload.nbf && payload.nbf > now) {
      console.error('JWT: Token not yet valid (nbf)')
      return null
    }

    // Check issued-at time isn't in the future (with 60s clock skew tolerance)
    if (payload.iat && payload.iat > now + 60) {
      console.error('JWT: Token issued in the future')
      return null
    }

    // Validate required claims
    if (!payload.sub) {
      console.error('JWT: Missing sub claim')
      return null
    }

    if (!payload.email) {
      console.error('JWT: Missing email claim')
      return null
    }

    // Verify issuer if configured (Supabase format: https://<project>.supabase.co/auth/v1)
    // This is optional but recommended for additional security
    if (env.SUPABASE_URL && payload.iss) {
      const expectedIssuer = `${env.SUPABASE_URL}/auth/v1`
      if (payload.iss !== expectedIssuer) {
        console.error(`JWT: Invalid issuer. Expected ${expectedIssuer}, got ${payload.iss}`)
        return null
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'authenticated',
    }
  } catch (error) {
    console.error('JWT: Verification error', error)
    return null
  }
}

/**
 * Auth middleware for Pages Functions
 *
 * Usage:
 * ```ts
 * import { withAuth } from '../middleware/auth'
 *
 * export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
 *   // user is guaranteed to be authenticated here
 *   return jsonResponse({ userId: user.id })
 * })
 * ```
 */
export function withAuth<E extends Env>(
  handler: (
    context: EventContext<E, string, Record<string, unknown>>,
    user: AuthUser
  ) => Promise<Response>
): PagesFunction<E> {
  return async (context) => {
    // Get Authorization header
    const authHeader = context.request.headers.get('Authorization')

    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401)
    }

    // Extract token (Bearer <token>)
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      return errorResponse('Invalid Authorization header format', 401)
    }

    const token = match[1]

    // Verify token
    const user = await verifyToken(token, context.env)

    if (!user) {
      return errorResponse('Invalid or expired token', 401)
    }

    // Call handler with authenticated user
    return handler(context, user)
  }
}

/**
 * Optional auth middleware - doesn't require auth but provides user if available
 */
export function withOptionalAuth<E extends Env>(
  handler: (
    context: EventContext<E, string, Record<string, unknown>>,
    user: AuthUser | null
  ) => Promise<Response>
): PagesFunction<E> {
  return async (context) => {
    const authHeader = context.request.headers.get('Authorization')
    let user: AuthUser | null = null

    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i)
      if (match) {
        user = await verifyToken(match[1], context.env)
      }
    }

    return handler(context, user)
  }
}
