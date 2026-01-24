/**
 * User Profile Endpoint
 * GET    /api/me - Get current user's profile
 * POST   /api/me - Create/update profile (upsert on first login)
 * DELETE /api/me - Delete account (deactivates Supabase user)
 *
 * This endpoint links Supabase auth.users to the D1 people table
 * via the auth_user_id column.
 */

import { Env, jsonResponse, errorResponse } from '../types'
import { withAuth, AuthUser } from '../middleware/auth'

// TODO: STAGE 4 - Implement these handlers

/**
 * GET /api/me
 * Returns the current user's profile from D1
 *
 * Response:
 * - 200: { person, memberships, roles }
 * - 404: Person not found (first login, needs POST to create)
 * - 401: Not authenticated
 */
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    // Find person by auth_user_id
    const person = await db
      .prepare('SELECT * FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first()

    if (!person) {
      return errorResponse('Profile not found. Please create one.', 404)
    }

    // Fetch club memberships
    const memberships = await db
      .prepare(`
        SELECT cm.*, c.name as club_name
        FROM club_memberships cm
        JOIN clubs c ON c.id = cm.club_id
        WHERE cm.person_id = ? AND cm.status = 'active'
      `)
      .bind(person.id)
      .all()

    // Fetch roles
    const roles = await db
      .prepare(`
        SELECT cmr.*, cr.name as role_name, cr.permissions_json
        FROM club_member_roles cmr
        JOIN club_roles cr ON cr.club_id = cmr.club_id AND cr.role_key = cmr.role_key
        WHERE cmr.person_id = ?
      `)
      .bind(person.id)
      .all()

    // Fetch active subscriptions for each membership
    const subscriptions = await db
      .prepare(`
        SELECT
          ms.id,
          ms.club_id,
          ms.person_id,
          ms.plan_id,
          ms.status,
          ms.start_at,
          ms.end_at,
          ms.stripe_subscription_id,
          bp.name as plan_name,
          bp.price_cents,
          bp.currency,
          bp.cadence,
          bp.weekly_sessions_allowed
        FROM member_subscriptions ms
        JOIN billing_plans bp ON bp.id = ms.plan_id
        WHERE ms.person_id = ? AND ms.status = 'active'
      `)
      .bind(person.id)
      .all()

    return jsonResponse({
      person,
      memberships: memberships.results,
      roles: roles.results,
      subscriptions: subscriptions.results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * POST /api/me
 * Create or update the user's profile
 *
 * On first login, creates a new person record linked to auth_user_id.
 * On subsequent calls, updates the profile.
 *
 * Request body:
 * - name: string (optional on update)
 * - photo_url: string (optional, URL to profile photo)
 *
 * Response:
 * - 200: { person }
 * - 201: { person } (created)
 * - 401: Not authenticated
 */
export const onRequestPost: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    // Parse request body
    let body: { name?: string; email?: string; photo_url?: string } = {}
    try {
      body = await context.request.json()
    } catch {
      // Empty body is OK for upsert
    }

    // Check if person already exists
    const existing = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (existing) {
      // Update existing profile - build dynamic update query
      const updates: string[] = []
      const values: (string | null)[] = []

      if (body.name !== undefined) {
        updates.push('name = ?')
        values.push(body.name)
      }

      if (body.email !== undefined) {
        updates.push('email = ?')
        values.push(body.email)
      }

      if (body.photo_url !== undefined) {
        updates.push('photo_url = ?')
        values.push(body.photo_url)
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')")
        values.push(existing.id)

        await db
          .prepare(`UPDATE people SET ${updates.join(', ')} WHERE id = ?`)
          .bind(...values)
          .run()
      }

      const person = await db
        .prepare('SELECT * FROM people WHERE id = ?')
        .bind(existing.id)
        .first()

      return jsonResponse({ person })
    }

    // Create new person
    const personId = crypto.randomUUID()
    const name = body.name || user.email.split('@')[0]

    await db
      .prepare(`
        INSERT INTO people (id, auth_user_id, name, email, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .bind(personId, user.id, name, user.email)
      .run()

    const person = await db
      .prepare('SELECT * FROM people WHERE id = ?')
      .bind(personId)
      .first()

    // Auto-create club membership for the default club
    // TODO: In production, check invitations table for matching email
    const DEFAULT_CLUB_ID = 'wwuwh-001'

    // Check if club exists
    const club = await db
      .prepare('SELECT id FROM clubs WHERE id = ?')
      .bind(DEFAULT_CLUB_ID)
      .first()

    if (club) {
      const membershipId = crypto.randomUUID()
      await db
        .prepare(`
          INSERT OR IGNORE INTO club_memberships
          (id, club_id, person_id, member_type, status, joined_at, created_at)
          VALUES (?, ?, ?, 'member', 'active', datetime('now'), datetime('now'))
        `)
        .bind(membershipId, DEFAULT_CLUB_ID, personId)
        .run()

      // Assign default member role
      await db
        .prepare(`
          INSERT OR IGNORE INTO club_member_roles
          (club_id, person_id, role_key, created_at)
          VALUES (?, ?, 'member', datetime('now'))
        `)
        .bind(DEFAULT_CLUB_ID, personId)
        .run()
    }

    return jsonResponse({ person, created: true }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/me
 * Delete the user's account
 *
 * This will:
 * 1. Deactivate club memberships
 * 2. Delete the Supabase auth user (they won't be able to log in)
 *
 * Request body:
 * - confirm: boolean (must be true to proceed)
 *
 * Response:
 * - 200: { success: true, message: 'Account deleted' }
 * - 400: Confirmation required
 * - 401: Not authenticated
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  try {
    // Parse request body
    let body: { confirm?: boolean } = {}
    try {
      body = await context.request.json()
    } catch {
      // Empty body
    }

    // Require explicit confirmation
    if (!body.confirm) {
      return errorResponse('Please confirm account deletion', 400)
    }

    // Find person by auth_user_id
    const person = await db
      .prepare('SELECT id FROM people WHERE auth_user_id = ?')
      .bind(user.id)
      .first<{ id: string }>()

    if (person) {
      // Deactivate all club memberships
      await db
        .prepare(`
          UPDATE club_memberships
          SET status = 'inactive', updated_at = datetime('now')
          WHERE person_id = ?
        `)
        .bind(person.id)
        .run()

      // Cancel any active subscriptions
      await db
        .prepare(`
          UPDATE member_subscriptions
          SET status = 'cancelled', end_at = datetime('now'), updated_at = datetime('now')
          WHERE person_id = ? AND status = 'active'
        `)
        .bind(person.id)
        .run()

      // Clear auth_user_id from person record (keeps history but unlinks from auth)
      await db
        .prepare(`
          UPDATE people
          SET auth_user_id = NULL, updated_at = datetime('now')
          WHERE id = ?
        `)
        .bind(person.id)
        .run()
    }

    // Delete the Supabase auth user via REST API
    const supabaseUrl = context.env.SUPABASE_URL
    const supabaseServiceKey = context.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const deleteResponse = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${user.id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
            },
          }
        )

        if (!deleteResponse.ok) {
          console.error('Failed to delete Supabase user:', await deleteResponse.text())
          // Continue anyway - the membership is already deactivated
        }
      } catch (err) {
        console.error('Failed to delete Supabase user:', err)
        // Continue anyway - the membership is already deactivated
      }
    }

    return jsonResponse({
      success: true,
      message: 'Your account has been deleted.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
