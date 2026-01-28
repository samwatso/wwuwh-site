/**
 * Admin Members Endpoint
 * GET /api/admin/members - Get all members with subscription and attendance stats
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withPermission } from '../../middleware/permission'
import { PERMISSIONS } from '../../lib/permissions'

type PricingCategory = 'adult' | 'student' | 'junior' | 'senior' | 'guest'

interface MemberWithStats {
  id: string
  person_id: string
  name: string
  email: string
  member_type: 'member' | 'guest'
  status: string
  joined_at: string | null
  pricing_category: PricingCategory
  subscription_status: string | null
  subscription_plan: string | null
  sessions_attended: number
  sessions_total: number
  last_attended: string | null
}

/**
 * GET /api/admin/members
 * Returns all members for a club with subscription and attendance stats
 *
 * Requires: members.view permission
 *
 * Query params:
 * - club_id (required)
 * - search (optional) - filter by name/email
 * - status (optional) - filter by membership status
 */
export const onRequestGet: PagesFunction<Env> = withPermission(PERMISSIONS.MEMBERS_VIEW)(
  async (context, auth) => {
    const db = context.env.WWUWH_DB
    const url = new URL(context.request.url)
    const search = url.searchParams.get('search')
    const statusFilter = url.searchParams.get('status')

    try {
      // Calculate date 12 weeks ago for attendance stats
    const twelveWeeksAgo = new Date()
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84)
    const twelveWeeksAgoStr = twelveWeeksAgo.toISOString()

    // Build the query
    let query = `
      SELECT
        cm.id,
        cm.person_id,
        p.name,
        p.email,
        p.pricing_category,
        cm.member_type,
        cm.status,
        cm.joined_at,
        ms.status as subscription_status,
        bp.name as subscription_plan,
        COALESCE(attendance.sessions_attended, 0) as sessions_attended,
        COALESCE(attendance.last_attended, NULL) as last_attended
      FROM club_memberships cm
      JOIN people p ON p.id = cm.person_id
      LEFT JOIN member_subscriptions ms ON ms.person_id = cm.person_id
        AND ms.club_id = cm.club_id
        AND ms.status = 'active'
      LEFT JOIN billing_plans bp ON bp.id = ms.plan_id
      LEFT JOIN (
        SELECT
          er.person_id,
          COUNT(CASE WHEN er.response = 'yes' THEN 1 END) as sessions_attended,
          MAX(CASE WHEN er.response = 'yes' THEN e.starts_at_utc END) as last_attended
        FROM event_rsvps er
        JOIN events e ON e.id = er.event_id
        WHERE e.club_id = ?1
          AND e.starts_at_utc >= ?2
          AND e.starts_at_utc <= datetime('now')
          AND e.status = 'completed'
        GROUP BY er.person_id
      ) attendance ON attendance.person_id = cm.person_id
      WHERE cm.club_id = ?1
    `

    const params: (string | number)[] = [auth.clubId, twelveWeeksAgoStr]

    // Add status filter
    if (statusFilter) {
      query += ` AND cm.status = ?${params.length + 1}`
      params.push(statusFilter)
    }

    // Add search filter
    if (search) {
      query += ` AND (p.name LIKE ?${params.length + 1} OR p.email LIKE ?${params.length + 1})`
      params.push(`%${search}%`)
    }

    query += ` ORDER BY p.name ASC`

    // Execute query
    const stmt = db.prepare(query)
    const result = await stmt.bind(...params).all<MemberWithStats>()

    // Get total sessions in the period for context
    const sessionsResult = await db
      .prepare(`
        SELECT COUNT(*) as total
        FROM events
        WHERE club_id = ?
          AND starts_at_utc >= ?
          AND starts_at_utc <= datetime('now')
          AND status = 'completed'
      `)
      .bind(auth.clubId, twelveWeeksAgoStr)
      .first<{ total: number }>()

    const totalSessions = sessionsResult?.total || 0

    // Add total sessions to each member
    const members = result.results.map(m => ({
      ...m,
      sessions_total: totalSessions,
    }))

    // Get summary stats
    const activeMembers = members.filter(m => m.status === 'active').length
    const activeSubscriptions = members.filter(m => m.subscription_status === 'active').length
    const guests = members.filter(m => m.member_type === 'guest').length

    return jsonResponse({
      members,
      stats: {
        total_members: members.length,
        active_members: activeMembers,
        active_subscriptions: activeSubscriptions,
        guests,
        period_sessions: totalSessions,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
