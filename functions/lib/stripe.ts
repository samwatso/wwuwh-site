/**
 * Stripe API utilities for Cloudflare Workers
 *
 * We use the Stripe REST API directly since the Node.js SDK
 * isn't compatible with Cloudflare Workers runtime.
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1'

interface StripeRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: Record<string, unknown>
}

/**
 * Make a request to the Stripe API
 */
export async function stripeRequest<T>(
  secretKey: string,
  endpoint: string,
  options: StripeRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body } = options

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  const response = await fetch(`${STRIPE_API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? encodeBody(body) : undefined,
  })

  const data = await response.json() as T & { error?: { message: string } }

  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe API error: ${response.status}`)
  }

  return data
}

/**
 * Encode body for Stripe API (application/x-www-form-urlencoded)
 */
function encodeBody(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key

    if (value === null || value === undefined) {
      continue
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(encodeBody(value as Record<string, unknown>, fullKey))
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          parts.push(encodeBody(item as Record<string, unknown>, `${fullKey}[${index}]`))
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`)
    }
  }

  return parts.filter(Boolean).join('&')
}

// ============================================
// Stripe Types
// ============================================

export interface StripeCheckoutSession {
  id: string
  object: 'checkout.session'
  url: string
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  status: 'open' | 'complete' | 'expired'
  customer: string | null
  customer_email: string | null
  metadata: Record<string, string>
  amount_total: number
  currency: string
}

export interface StripeCheckoutLineItem {
  price_data: {
    currency: string
    unit_amount: number
    product_data: {
      name: string
      description?: string
    }
  }
  quantity: number
}

export interface CreateCheckoutSessionParams {
  mode: 'payment' | 'subscription'
  success_url: string
  cancel_url: string
  customer_email?: string
  line_items: StripeCheckoutLineItem[]
  metadata?: Record<string, string>
}

/**
 * Create a Stripe Checkout Session
 */
export async function createCheckoutSession(
  secretKey: string,
  params: CreateCheckoutSessionParams
): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>(secretKey, '/checkout/sessions', {
    method: 'POST',
    body: params as unknown as Record<string, unknown>,
  })
}

// ============================================
// Webhook Verification
// ============================================

/**
 * Verify Stripe webhook signature
 * Based on Stripe's webhook signature verification
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(',')
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
  const v1Signature = parts.find(p => p.startsWith('v1='))?.slice(3)

  if (!timestamp || !v1Signature) {
    return false
  }

  // Check timestamp is within 5 minutes
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10)
  if (timestampAge > 300) {
    return false
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  )
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (v1Signature.length !== expectedSignature.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < v1Signature.length; i++) {
    result |= v1Signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }
  return result === 0
}

export interface StripeEvent {
  id: string
  object: 'event'
  type: string
  data: {
    object: Record<string, unknown>
  }
}

// ============================================
// Product & Price Types
// ============================================

export interface StripeProduct {
  id: string
  object: 'product'
  name: string
  description: string | null
  active: boolean
  metadata: Record<string, string>
}

export interface StripePrice {
  id: string
  object: 'price'
  product: string
  unit_amount: number
  currency: string
  active: boolean
  recurring: {
    interval: 'month' | 'year' | 'week' | 'day'
    interval_count: number
  } | null
  metadata: Record<string, string>
}

/**
 * Create a Stripe Product
 */
export async function createProduct(
  secretKey: string,
  params: {
    name: string
    description?: string
    metadata?: Record<string, string>
  }
): Promise<StripeProduct> {
  return stripeRequest<StripeProduct>(secretKey, '/products', {
    method: 'POST',
    body: params,
  })
}

/**
 * Create a Stripe Price
 */
export async function createPrice(
  secretKey: string,
  params: {
    product: string
    unit_amount: number
    currency: string
    recurring?: {
      interval: 'month' | 'year' | 'week' | 'day'
    }
    metadata?: Record<string, string>
  }
): Promise<StripePrice> {
  return stripeRequest<StripePrice>(secretKey, '/prices', {
    method: 'POST',
    body: params,
  })
}

// ============================================
// Customer Types
// ============================================

export interface StripeCustomer {
  id: string
  object: 'customer'
  email: string | null
  name: string | null
  metadata: Record<string, string>
}

/**
 * Create a Stripe Customer
 */
export async function createCustomer(
  secretKey: string,
  params: {
    email: string
    name?: string
    metadata?: Record<string, string>
  }
): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>(secretKey, '/customers', {
    method: 'POST',
    body: params,
  })
}

/**
 * Get a Stripe Customer by ID
 */
export async function getCustomer(
  secretKey: string,
  customerId: string
): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>(secretKey, `/customers/${customerId}`)
}

// ============================================
// Subscription Types
// ============================================

export interface StripeSubscription {
  id: string
  object: 'subscription'
  customer: string
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused'
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  canceled_at: number | null
  items: {
    data: Array<{
      id: string
      price: {
        id: string
        product: string
      }
    }>
  }
  metadata: Record<string, string>
}

/**
 * Create a Subscription Checkout Session
 */
export async function createSubscriptionCheckout(
  secretKey: string,
  params: {
    customer: string
    price_id: string
    success_url: string
    cancel_url: string
    metadata?: Record<string, string>
  }
): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>(secretKey, '/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'subscription',
      customer: params.customer,
      line_items: [
        {
          price: params.price_id,
          quantity: 1,
        },
      ],
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      metadata: params.metadata,
    },
  })
}

// ============================================
// Billing Portal
// ============================================

export interface StripeBillingPortalSession {
  id: string
  object: 'billing_portal.session'
  url: string
  customer: string
  return_url: string
}

/**
 * Create a Billing Portal Session
 */
export async function createBillingPortalSession(
  secretKey: string,
  params: {
    customer: string
    return_url: string
  }
): Promise<StripeBillingPortalSession> {
  return stripeRequest<StripeBillingPortalSession>(secretKey, '/billing_portal/sessions', {
    method: 'POST',
    body: params,
  })
}
