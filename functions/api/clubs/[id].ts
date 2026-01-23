/**
 * Club Details Endpoint
 * GET /api/clubs/:id - Get club details
 *
 * Returns club info including:
 * - Basic club data
 * - Member count (if user is a member)
 * - User's membership status
 *
 * TODO: STAGE 5+ - Implement full club details
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { withAuth } from '../../middleware/auth'

export const onRequestGet: PagesFunction<Env> = withAuth(async (context, _user) => {
  const clubId = context.params.id as string

  if (!clubId) {
    return errorResponse('Club ID is required', 400)
  }

  const db = context.env.WWUWH_DB

  try {
    // Get club details
    const club = await db
      .prepare('SELECT * FROM clubs WHERE id = ? AND archived_at IS NULL')
      .bind(clubId)
      .first()

    if (!club) {
      return errorResponse('Club not found', 404)
    }

    // TODO: STAGE 5+ - Check user's membership and return appropriate data
    // const person = await db
    //   .prepare('SELECT id FROM people WHERE auth_user_id = ?')
    //   .bind(user.id)
    //   .first<{ id: string }>()
    //
    // let membership = null
    // let memberCount = null
    //
    // if (person) {
    //   membership = await db
    //     .prepare(`
    //       SELECT * FROM club_memberships
    //       WHERE club_id = ? AND person_id = ?
    //     `)
    //     .bind(clubId, person.id)
    //     .first()
    //
    //   if (membership) {
    //     const countResult = await db
    //       .prepare(`
    //         SELECT COUNT(*) as count FROM club_memberships
    //         WHERE club_id = ? AND status = 'active'
    //       `)
    //       .bind(clubId)
    //       .first<{ count: number }>()
    //     memberCount = countResult?.count
    //   }
    // }

    return jsonResponse({
      club,
      // membership,
      // member_count: memberCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
