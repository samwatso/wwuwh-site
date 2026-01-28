/**
 * Pricing Logic
 *
 * Centralized pricing calculation for event payments.
 * Handles category fallbacks and tier lookups.
 */

export type PricingCategory = 'adult' | 'student' | 'junior' | 'senior' | 'guest'

export interface PricingTier {
  category: PricingCategory
  price_cents: number
  currency: string
}

export interface ComputedPricing {
  /** The effective category after fallback rules */
  charged_category: PricingCategory
  /** The amount to charge in cents */
  amount_cents: number
  /** Currency code */
  currency: string
  /** Where the price came from */
  source: 'tier' | 'event_fee_fallback'
  /** Original category before fallback */
  original_category: PricingCategory
}

export const PRICING_CATEGORY_LABELS: Record<PricingCategory, string> = {
  adult: 'Adult',
  student: 'Student',
  junior: 'Junior',
  senior: 'Senior',
  guest: 'Guest',
}

/**
 * Get all pricing tiers for an event
 */
export async function getEventPricingTiers(
  db: D1Database,
  eventId: string
): Promise<PricingTier[]> {
  const result = await db
    .prepare(`
      SELECT category, price_cents, currency
      FROM event_pricing_tiers
      WHERE event_id = ?
    `)
    .bind(eventId)
    .all<PricingTier>()

  return result.results
}

/**
 * Compute the effective category and price for a person attending an event.
 *
 * Fallback rules:
 * - senior → adult (if no senior tier)
 * - junior → student (if no junior tier, then adult if no student)
 * - student → adult (if no student tier)
 * - guest → adult (if no guest tier)
 * - adult → event.fee_cents fallback if no adult tier
 */
export async function computeEffectiveCategoryAndPrice(
  db: D1Database,
  options: {
    person_category: PricingCategory
    event_id: string
    event_fee_cents: number | null
    currency: string
  }
): Promise<ComputedPricing> {
  const { person_category, event_id, event_fee_cents, currency } = options

  // Get all tiers for this event
  const tiers = await getEventPricingTiers(db, event_id)
  const tierMap = new Map(tiers.map(t => [t.category, t]))

  // Apply fallback rules
  const result = resolveCategoryWithFallback(person_category, tierMap, event_fee_cents, currency)

  return {
    ...result,
    original_category: person_category,
  }
}

/**
 * Synchronous version when tiers are already loaded
 */
export function computeEffectiveCategoryAndPriceSync(
  person_category: PricingCategory,
  tiers: PricingTier[],
  event_fee_cents: number | null,
  currency: string
): ComputedPricing {
  const tierMap = new Map(tiers.map(t => [t.category, t]))
  const result = resolveCategoryWithFallback(person_category, tierMap, event_fee_cents, currency)

  return {
    ...result,
    original_category: person_category,
  }
}

/**
 * Core fallback logic
 */
function resolveCategoryWithFallback(
  category: PricingCategory,
  tierMap: Map<PricingCategory, PricingTier>,
  event_fee_cents: number | null,
  currency: string
): Omit<ComputedPricing, 'original_category'> {
  // Try exact match first
  if (tierMap.has(category)) {
    const tier = tierMap.get(category)!
    return {
      charged_category: category,
      amount_cents: tier.price_cents,
      currency: tier.currency || currency,
      source: 'tier',
    }
  }

  // Apply fallback rules based on category
  switch (category) {
    case 'senior':
      // senior → adult
      if (tierMap.has('adult')) {
        const tier = tierMap.get('adult')!
        return {
          charged_category: 'adult',
          amount_cents: tier.price_cents,
          currency: tier.currency || currency,
          source: 'tier',
        }
      }
      break

    case 'junior':
      // junior → student → adult
      if (tierMap.has('student')) {
        const tier = tierMap.get('student')!
        return {
          charged_category: 'student',
          amount_cents: tier.price_cents,
          currency: tier.currency || currency,
          source: 'tier',
        }
      }
      if (tierMap.has('adult')) {
        const tier = tierMap.get('adult')!
        return {
          charged_category: 'adult',
          amount_cents: tier.price_cents,
          currency: tier.currency || currency,
          source: 'tier',
        }
      }
      break

    case 'student':
      // student → adult
      if (tierMap.has('adult')) {
        const tier = tierMap.get('adult')!
        return {
          charged_category: 'adult',
          amount_cents: tier.price_cents,
          currency: tier.currency || currency,
          source: 'tier',
        }
      }
      break

    case 'guest':
      // guest → adult
      if (tierMap.has('adult')) {
        const tier = tierMap.get('adult')!
        return {
          charged_category: 'adult',
          amount_cents: tier.price_cents,
          currency: tier.currency || currency,
          source: 'tier',
        }
      }
      break

    case 'adult':
      // adult has no further fallback to tiers
      break
  }

  // Final fallback: use event.fee_cents
  return {
    charged_category: 'adult',
    amount_cents: event_fee_cents ?? 0,
    currency,
    source: 'event_fee_fallback',
  }
}

/**
 * Upsert pricing tiers for an event
 */
export async function upsertEventPricingTiers(
  db: D1Database,
  eventId: string,
  tiers: Partial<Record<PricingCategory, number | null>>,
  currency: string
): Promise<void> {
  const categories: PricingCategory[] = ['adult', 'student', 'junior', 'senior', 'guest']

  for (const category of categories) {
    const price = tiers[category]

    if (price !== undefined && price !== null) {
      // Upsert the tier
      const id = crypto.randomUUID()
      await db
        .prepare(`
          INSERT INTO event_pricing_tiers (id, event_id, category, price_cents, currency, created_at)
          VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          ON CONFLICT(event_id, category) DO UPDATE SET
            price_cents = excluded.price_cents,
            currency = excluded.currency
        `)
        .bind(id, eventId, category, price, currency)
        .run()
    } else if (price === null) {
      // Delete the tier (but never delete adult if it's the only one)
      if (category !== 'adult') {
        await db
          .prepare('DELETE FROM event_pricing_tiers WHERE event_id = ? AND category = ?')
          .bind(eventId, category)
          .run()
      }
    }
    // If price === undefined, don't touch it
  }
}

/**
 * Delete all pricing tiers for an event
 */
export async function deleteEventPricingTiers(
  db: D1Database,
  eventId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM event_pricing_tiers WHERE event_id = ?')
    .bind(eventId)
    .run()
}

/**
 * Format price for display
 */
export function formatPrice(amount_cents: number, currency: string = 'GBP'): string {
  const amount = amount_cents / 100
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  return `${symbol}${amount.toFixed(2)}`
}

/**
 * Format pricing summary for display
 * e.g., "Thursday Session Adult rate - £5.00"
 */
export function formatPricingSummary(
  eventTitle: string,
  charged_category: PricingCategory,
  amount_cents: number,
  currency: string = 'GBP'
): string {
  const categoryLabel = PRICING_CATEGORY_LABELS[charged_category]
  const priceStr = formatPrice(amount_cents, currency)
  return `${eventTitle} ${categoryLabel} rate - ${priceStr}`
}
