/**
 * Database types generated from db/schema.sql
 *
 * These types match the Cloudflare D1 schema.
 * TODO: STAGE 3 - Consider auto-generating these from the schema
 */

// ============================================
// CORE ENTITIES
// ============================================

export interface Club {
  id: string
  name: string
  timezone: string
  created_at: string
  archived_at: string | null
}

export type PricingCategory = 'adult' | 'student' | 'junior' | 'senior' | 'guest'

export const PRICING_CATEGORY_LABELS: Record<PricingCategory, string> = {
  adult: 'Adult',
  student: 'Student',
  junior: 'Junior',
  senior: 'Senior',
  guest: 'Guest',
}

export interface Person {
  id: string
  auth_user_id: string | null // Links to Supabase auth.users.id
  name: string
  email: string
  photo_url: string | null
  medical_flag: number // 0 | 1
  rating: number | null
  notes_private: string | null
  pricing_category: PricingCategory // Pricing tier for event payments
  created_at: string
  updated_at: string
}

export type MemberType = 'member' | 'guest'
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'left'

export interface ClubMembership {
  id: string
  club_id: string
  person_id: string
  member_type: MemberType
  status: MembershipStatus
  joined_at: string | null
  left_at: string | null
  created_at: string
}

export interface ClubRole {
  club_id: string
  role_key: string
  name: string
  permissions_json: string // JSON string
}

export interface ClubMemberRole {
  club_id: string
  person_id: string
  role_key: string
  created_at: string
}

// ============================================
// INVITATIONS
// ============================================

export interface Invitation {
  id: string
  club_id: string
  email: string
  name_hint: string | null
  member_type: MemberType
  role_key: string | null
  group_id: string | null
  token_hash: string
  expires_at: string | null
  accepted_at: string | null
  created_at: string
}

// ============================================
// GROUPS
// ============================================

export type GroupKind = 'team' | 'committee' | 'squad' | 'other'
export type GroupRole = 'member' | 'coach' | 'captain' | 'admin'

export interface Group {
  id: string
  club_id: string
  name: string
  kind: GroupKind
  description: string | null
  created_at: string
  archived_at: string | null
}

export interface GroupMember {
  group_id: string
  person_id: string
  group_role: GroupRole
  added_at: string
}

// ============================================
// EVENTS
// ============================================

export interface EventSeries {
  id: string
  club_id: string
  group_id: string | null
  title: string
  description: string | null
  location: string | null
  weekday_mask: number // Bitmask: Mon=1, Tue=2, Wed=4, etc.
  start_time_local: string // e.g. "21:00"
  duration_min: number
  start_date: string
  end_date: string | null
  default_fee_cents: number | null
  currency: string
  created_at: string
  archived_at: string | null
}

export type EventKind = 'session' | 'match' | 'tournament' | 'social' | 'other' | 'training' | 'ladies'
export type EventStatus = 'scheduled' | 'cancelled' | 'completed'
export type PaymentMode = 'included' | 'one_off' | 'free'

export interface Event {
  id: string
  club_id: string
  group_id: string | null
  series_id: string | null
  kind: EventKind
  title: string
  description: string | null
  location: string | null
  starts_at_utc: string
  ends_at_utc: string
  timezone: string
  capacity: number | null
  status: EventStatus
  payment_mode: PaymentMode
  fee_cents: number | null
  currency: string
  created_by_person_id: string | null
  created_at: string
  updated_at: string
}

export type RsvpResponse = 'yes' | 'no' | 'maybe'

export interface EventRsvp {
  event_id: string
  person_id: string
  response: RsvpResponse
  responded_at: string
  note: string | null
}

// Payment source types
export type PaymentSource = 'stripe' | 'cash' | 'bank_transfer' | 'manual'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled'

// Extended Event with RSVP counts (returned by /api/events)
export interface EventWithRsvp extends Event {
  rsvp_yes_count: number
  rsvp_no_count: number
  rsvp_maybe_count: number
  my_rsvp: RsvpResponse | null
  has_paid: number | null // 1 if paid, 0 or null if not
  payment_source: PaymentSource | null // stripe, cash, bank_transfer
  payment_status: PaymentStatus | null // pending, succeeded, failed, cancelled
  // Subscription info
  subscription_status: SubscriptionStatus | null
  subscription_plan: string | null
  sessions_allowed: number
  sessions_used_this_week: number
  payment_required: boolean
  subscription_used: number | null // 1 if subscription used for this event
  // External source tracking (for events promoted from BOA etc)
  external_source: string | null // e.g. 'boa' for British Octopush Association events
  // Computed pricing based on person's pricing category
  computed_price_cents: number | null // Effective price for this person
  computed_category: PricingCategory | null // Category used for pricing
  pricing_source: 'tier' | 'event_fee_fallback' | null // Where the price came from
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface EventAttendance {
  event_id: string
  person_id: string
  status: AttendanceStatus
  checked_in_at: string | null
}

// ============================================
// EVENT PRICING TIERS
// ============================================

export interface EventPricingTier {
  id: string
  event_id: string
  category: PricingCategory
  price_cents: number
  currency: string
  created_at: string
}

export interface ComputedPricing {
  charged_category: PricingCategory
  amount_cents: number
  currency: string
  source: 'tier' | 'event_fee_fallback'
  original_category: PricingCategory
}

// ============================================
// BILLING
// ============================================

export interface BillingPlan {
  id: string
  club_id: string
  name: string
  cadence: 'month'
  weekly_sessions_allowed: -1 | 1 | 2  // -1 = unlimited
  price_cents: number
  currency: string
  stripe_price_id: string | null
  active: number // 0 | 1
  created_at: string
}

export type SubscriptionStatus = 'active' | 'past_due' | 'paused' | 'cancelled'

export interface MemberSubscription {
  id: string
  club_id: string
  person_id: string
  plan_id: string
  status: SubscriptionStatus
  start_at: string
  end_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}

export interface SubscriptionUsage {
  subscription_id: string
  event_id: string
  used_at: string
}

// ============================================
// PAYMENTS
// ============================================

export type PaymentRequestStatus = 'open' | 'closed' | 'cancelled'

export interface PaymentRequest {
  id: string
  club_id: string
  event_id: string | null
  name: string
  description: string | null
  amount_cents: number
  currency: string
  due_at: string | null
  status: PaymentRequestStatus
  created_by_person_id: string | null
  created_at: string
}

export type RecipientStatus = 'due' | 'paid' | 'waived'

export interface PaymentRequestRecipient {
  payment_request_id: string
  person_id: string
  amount_cents: number | null
  status: RecipientStatus
}

export type TransactionSource = 'stripe' | 'cash' | 'bank_transfer' | 'manual'
export type TransactionType = 'charge' | 'refund' | 'adjustment'
export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled'

export interface Transaction {
  id: string
  club_id: string
  person_id: string | null
  event_id: string | null
  payment_request_id: string | null
  source: TransactionSource
  type: TransactionType
  amount_cents: number
  currency: string
  status: TransactionStatus
  charged_category: PricingCategory | null // The effective category used for pricing
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_refund_id: string | null
  collected_by_person_id: string | null
  created_at: string
  effective_at: string | null
}

export type RefundRequestStatus = 'requested' | 'approved' | 'declined' | 'processed'

export interface RefundRequest {
  id: string
  club_id: string
  original_transaction_id: string
  requested_by_person_id: string
  reason: string | null
  status: RefundRequestStatus
  reviewed_by_person_id: string | null
  reviewed_at: string | null
  created_at: string
}

// ============================================
// AUDIT
// ============================================

export interface AuditLogEntry {
  id: string
  club_id: string
  actor_person_id: string | null
  action: string
  entity_type: string
  entity_id: string
  metadata_json: string
  created_at: string
}
