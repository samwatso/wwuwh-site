/**
 * Auth Middleware for API Routes
 *
 * Verifies Supabase JWT tokens and extracts user information.
 * Supports both ES256 (ECDSA) and HS256 (HMAC) algorithms.
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

// Cache for JWKS keys (in-memory, per worker instance)
let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null
const JWKS_CACHE_TTL = 3600 * 1000 // 1 hour

/**
 * Base64URL decode (handles JWT's URL-safe base64)
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Fetch JWKS (JSON Web Key Set) from Supabase
 */
async function fetchJwks(supabaseUrl: string): Promise<JsonWebKey[]> {
  // Check cache
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys
  }

  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`

  try {
    const response = await fetch(jwksUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`)
    }

    const jwks = await response.json() as { keys: JsonWebKey[] }

    // Cache the keys
    jwksCache = {
      keys: jwks.keys,
      fetchedAt: Date.now()
    }

    return jwks.keys
  } catch (error) {
    console.error('Failed to fetch JWKS:', error)
    // Return cached keys if available, even if expired
    if (jwksCache) {
      return jwksCache.keys
    }
    throw error
  }
}

/**
 * Find the correct key from JWKS by key ID
 */
function findKey(keys: JsonWebKey[], kid: string): JsonWebKey | null {
  return keys.find(k => k.kid === kid) || null
}

/**
 * Verify ES256 (ECDSA with P-256) signature
 */
async function verifyES256(
  token: string,
  publicKey: JsonWebKey
): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return false
  }

  const [header, payload, signature] = parts
  const signatureInput = new TextEncoder().encode(`${header}.${payload}`)
  const signatureBytes = base64UrlDecode(signature)

  try {
    // Import the public key for ECDSA verification
    const key = await crypto.subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signatureBytes,
      signatureInput
    )

    return isValid
  } catch (error) {
    console.error('ES256 verification error:', error)
    return false
  }
}

/**
 * Verify HS256 (HMAC-SHA256) signature
 */
async function verifyHS256(
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
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signatureInput)
    )

    // Base64URL encode the expected signature
    const bytes = new Uint8Array(signatureBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const expectedSignature = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Constant-time comparison
    if (expectedSignature.length !== signature.length) {
      return false
    }
    let result = 0
    for (let i = 0; i < expectedSignature.length; i++) {
      result |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i)
    }
    return result === 0
  } catch {
    return false
  }
}

/**
 * Verify a Supabase JWT token
 *
 * Supports both ES256 (new Supabase projects) and HS256 (legacy)
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

    // Decode header to get algorithm and key ID
    const headerBytes = base64UrlDecode(parts[0])
    const headerText = new TextDecoder().decode(headerBytes)
    const header = JSON.parse(headerText) as { alg: string; kid?: string }

    // Decode payload
    const payloadBytes = base64UrlDecode(parts[1])
    const payloadText = new TextDecoder().decode(payloadBytes)
    const payload = JSON.parse(payloadText)

    // Verify signature based on algorithm
    if (header.alg === 'ES256') {
      // ES256 - use JWKS public key
      if (!env.SUPABASE_URL) {
        console.error('JWT: SUPABASE_URL required for ES256 verification')
        return null
      }

      if (!header.kid) {
        console.error('JWT: Missing kid in header for ES256')
        return null
      }

      const keys = await fetchJwks(env.SUPABASE_URL)
      const publicKey = findKey(keys, header.kid)

      if (!publicKey) {
        console.error(`JWT: No matching key found for kid: ${header.kid}`)
        return null
      }

      const isValid = await verifyES256(token, publicKey)
      if (!isValid) {
        console.error('JWT: ES256 signature verification failed')
        return null
      }
    } else if (header.alg === 'HS256') {
      // HS256 - use JWT secret
      const jwtSecret = env.SUPABASE_JWT_SECRET
      if (!jwtSecret) {
        console.warn('JWT: SUPABASE_JWT_SECRET not configured for HS256')
        // Continue without verification for backwards compatibility
      } else {
        const isValid = await verifyHS256(token, jwtSecret)
        if (!isValid) {
          // Try base64 decoded secret as fallback
          try {
            const decodedSecret = atob(jwtSecret)
            const isValidDecoded = await verifyHS256(token, decodedSecret)
            if (!isValidDecoded) {
              console.error('JWT: HS256 signature verification failed')
              return null
            }
          } catch {
            console.error('JWT: HS256 signature verification failed')
            return null
          }
        }
      }
    } else {
      console.error(`JWT: Unsupported algorithm: ${header.alg}`)
      return null
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      console.error('JWT: Token expired')
      return null
    }

    // Check not-before time
    if (payload.nbf && payload.nbf > now) {
      console.error('JWT: Token not yet valid (nbf)')
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
 */
export function withAuth<E extends Env>(
  handler: (
    context: EventContext<E, string, Record<string, unknown>>,
    user: AuthUser
  ) => Promise<Response>
): PagesFunction<E> {
  return async (context) => {
    const authHeader = context.request.headers.get('Authorization')

    if (!authHeader) {
      return errorResponse('Missing Authorization header', 401)
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      return errorResponse('Invalid Authorization header format', 401)
    }

    const token = match[1]
    const user = await verifyToken(token, context.env)

    if (!user) {
      return errorResponse('Invalid or expired token', 401)
    }

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
