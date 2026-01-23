/**
 * Admin Member Detail Endpoint
 * GET /api/admin/members/:id - Get member details including subscription and payments
 */

import { Env, jsonResponse, errorResponse } from '../../../types'
import { withAuth } from '../../../middleware/auth'
import { isAdmin } from '../../../middleware/admin'

interface MemberDetail {
  id: string
  person_id: string
  name: string
  email: string
  member_type: 'member' | 'guest'
  status: string
  joined_at: string | null
  subscription: {
    id: string
    plan_id: string
    plan_name: string
    status: string
    start_at: string
    end_at: string | null
    weekly_sessions_allowed: number
    price_cents: number
    is_manual: boolean
  } | null
  recent_payments: Array<{
    id: string
    source: string
    type: string
    amount_cents: number
    currency: string
    status: string
    created_at: string
  }>
}

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const clubId = url.searchParams.get('club_id')
  const memberId = context.params.id as string

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  if (!memberId) {
    return errorResponse('Member ID is required', 400)
  }

  try {
    // Get person record for admin check
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (!person) {
      return errorResponse('Profile not found', 404)
    }

    // Check admin role
    const adminCheck = await isAdmin(db, person.id, clubId)
    if (!adminCheck) {
      return errorResponse('Admin access required', 403)
    }

    // Get member details
    const member = await db
      .prepare(`
        SELECT
          cm.id,
          cm.person_id,
          p.name,
          p.email,
          cm.member_type,
          cm.status,
          cm.joined_at
        FROM club_memberships cm
        JOIN people p ON p.id = cm.person_id
        WHERE cm.id = ? AND cm.club_id = ?
      `)
      .bind(memberId, clubId)
      .first<{
        id: string
        person_id: string
        name: string
        email: string
        member_type: 'member' | 'guest'
        status: string
        joined_at: string | null
      }>()

    if (!member) {
      return errorResponse('Member not found', 404)
    }

    // Get active subscription
    const subscription = await db
      .prepare(`
        SELECT
          ms.id,
          ms.plan_id,
          bp.name as plan_name,
          ms.status,
          ms.start_at,
          ms.end_at,
          bp.weekly_sessions_allowed,
          bp.price_cents,
          ms.stripe_subscription_id
        FROM member_subscriptions ms
        JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE ms.person_id = ? AND ms.club_id = ? AND ms.status = 'active'
        LIMIT 1
      `)
      .bind(member.person_id, clubId)
      .first<{
        id: string
        plan_id: string
        plan_name: string
        status: string
        start_at: string
        end_at: string | null
        weekly_sessions_allowed: number
        price_cents: number
        stripe_subscription_id: string | null
      }>()

    // Get recent payments (last 10)
    const payments = await db
      .prepare(`
        SELECT
          id,
          source,
          type,
          amount_cents,
          currency,
          status,
          created_at
        FROM transactions
        WHERE person_id = ? AND club_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `)
      .bind(member.person_id, clubId)
      .all<{
        id: string
        source: string
        type: string
        amount_cents: number
        currency: string
        status: string
        created_at: string
      }>()

    const result: MemberDetail = {
      ...member,
      subscription: subscription ? {
        ...subscription,
        is_manual: !subscription.stripe_subscription_id,
      } : null,
      recent_payments: payments.results || [],
    }

    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
