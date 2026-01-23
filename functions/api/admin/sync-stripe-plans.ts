/**
 * Admin: Sync Billing Plans to Stripe
 * POST /api/admin/sync-stripe-plans
 *
 * Creates Stripe Products and Prices for billing plans that don't have them yet.
 * Requires admin role for the club.
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth, AuthUser } from '../../middleware/auth'
import { createProduct, createPrice } from '../../lib/stripe'

interface BillingPlan {
  id: string
  club_id: string
  name: string
  cadence: string
  weekly_sessions_allowed: number
  price_cents: number
  currency: string
  stripe_product_id: string | null
  stripe_price_id: string | null
  active: number
}

export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const stripeKey = context.env.STRIPE_SECRET_KEY

  if (!stripeKey) {
    return errorResponse('Stripe is not configured', 500)
  }

  try {
    // Parse request body
    const body = await context.request.json() as { club_id: string }
    const { club_id } = body

    if (!club_id) {
      return errorResponse('club_id is required', 400)
    }

    // Get person ID for this auth user
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check if user has admin role for this club
    const adminRole = await db
      .prepare(`
        SELECT 1 FROM club_member_roles
        WHERE club_id = ? AND person_id = ? AND role_key = 'admin'
      `)
      .bind(club_id, person.id)
      .first()

    if (!adminRole) {
      return errorResponse('Admin access required', 403)
    }

    // Get all active billing plans for the club
    const plans = await db
      .prepare(`
        SELECT * FROM billing_plans
        WHERE club_id = ? AND active = 1
      `)
      .bind(club_id)
      .all<BillingPlan>()

    const results = {
      products_created: 0,
      prices_created: 0,
      plans_updated: [] as string[],
      errors: [] as string[],
    }

    // Process each plan
    for (const plan of plans.results) {
      try {
        let productId = plan.stripe_product_id
        let priceId = plan.stripe_price_id

        // Create product if needed
        if (!productId) {
          const sessionsText = plan.weekly_sessions_allowed === 1
            ? '1 session per week'
            : `${plan.weekly_sessions_allowed} sessions per week`

          const product = await createProduct(stripeKey, {
            name: plan.name,
            description: sessionsText,
            metadata: {
              plan_id: plan.id,
              club_id: plan.club_id,
            },
          })

          productId = product.id
          results.products_created++

          // Update plan with product ID
          await db
            .prepare('UPDATE billing_plans SET stripe_product_id = ? WHERE id = ?')
            .bind(productId, plan.id)
            .run()
        }

        // Create price if needed
        if (!priceId && productId) {
          const price = await createPrice(stripeKey, {
            product: productId,
            unit_amount: plan.price_cents,
            currency: plan.currency.toLowerCase(),
            recurring: {
              interval: plan.cadence as 'month',
            },
            metadata: {
              plan_id: plan.id,
              club_id: plan.club_id,
            },
          })

          priceId = price.id
          results.prices_created++

          // Update plan with price ID
          await db
            .prepare('UPDATE billing_plans SET stripe_price_id = ? WHERE id = ?')
            .bind(priceId, plan.id)
            .run()
        }

        if (productId && priceId) {
          results.plans_updated.push(plan.id)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        results.errors.push(`${plan.name}: ${message}`)
      }
    }

    return jsonResponse({
      success: true,
      ...results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
