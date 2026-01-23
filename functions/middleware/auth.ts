/**
 * Auth Middleware for API Routes
 *
 * Verifies Supabase JWT tokens and extracts user information.
 * Add this to protected routes to require authentication.
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
 * Verify a Supabase JWT token
 *
 * Note: This is a simplified verification that decodes the JWT
 * and checks basic claims. For production, you should verify
 * the signature using the Supabase JWT secret.
 *
 * TODO: Add proper JWT signature verification with SUPABASE_JWT_SECRET
 */
export async function verifyToken(
  token: string,
  _env: Env
): Promise<AuthUser | null> {
  try {
    // Decode JWT (base64url decode the payload)
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Decode payload (middle part)
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }

    // Extract user info
    if (!payload.sub || !payload.email) {
      return null
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role || 'authenticated',
    }
  } catch {
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
