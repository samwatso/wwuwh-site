/**
 * Admin External Event Detail Endpoint
 * PUT /api/admin/external-events/:id - Update a manual external event
 * DELETE /api/admin/external-events/:id - Delete a manual external event
 */

import { Env, jsonResponse, errorResponse } from '../../../../types'
import { withAuth } from '../../../../middleware/auth'
import { isAdmin } from '../../../../middleware/admin'

interface UpdateManualEventRequest {
  club_id: string
  title?: string
  description?: string | null
  location?: string | null
  url?: string | null
  source?: string
  starts_at_utc?: string
  ends_at_utc?: string | null
  status?: 'active' | 'cancelled' | 'tentative'
  visibility?: 'public' | 'admin_only' | 'coach_only'
}

interface ExternalEvent {
  id: string
  source: string
  source_event_id: string
  title: string
  description: string | null
  location: string | null
  url: string | null
  starts_at_utc: string
  ends_at_utc: string | null
  status: string
  origin: string | null
  visibility: string | null
  created_by_person_id: string | null
  updated_by_person_id: string | null
}

/**
 * PUT /api/admin/external-events/:id
 * Update a manual external event (only origin='manual' events can be updated)
 */
export const onRequestPut: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const externalEventId = context.params.id as string

  let body: UpdateManualEventRequest
  try {
    body = await context.request.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { club_id: clubId } = body

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get person record
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

    // Check that the event exists and is a manual event
    const existing = await db
      .prepare('SELECT id, origin FROM external_events WHERE id = ?')
      .bind(externalEventId)
      .first<{ id: string; origin: string | null }>()

    if (!existing) {
      return errorResponse('External event not found', 404)
    }

    if (existing.origin !== 'manual') {
      return errorResponse('Only manual events can be edited', 400)
    }

    // Build update query dynamically based on provided fields
    const updates: string[] = []
    const values: (string | null)[] = []

    if (body.title !== undefined) {
      updates.push('title = ?')
      values.push(body.title)
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      values.push(body.description)
    }
    if (body.location !== undefined) {
      updates.push('location = ?')
      values.push(body.location)
    }
    if (body.url !== undefined) {
      updates.push('url = ?')
      values.push(body.url)
    }
    if (body.source !== undefined) {
      updates.push('source = ?')
      values.push(body.source)
    }
    if (body.starts_at_utc !== undefined) {
      updates.push('starts_at_utc = ?')
      values.push(body.starts_at_utc)
    }
    if (body.ends_at_utc !== undefined) {
      updates.push('ends_at_utc = ?')
      values.push(body.ends_at_utc)
    }
    if (body.status !== undefined) {
      updates.push('status = ?')
      values.push(body.status)
    }
    if (body.visibility !== undefined) {
      updates.push('visibility = ?')
      values.push(body.visibility)
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400)
    }

    // Always update updated_at and updated_by_person_id
    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    updates.push('updated_by_person_id = ?')
    values.push(person.id)

    // Add the WHERE id
    values.push(externalEventId)

    await db
      .prepare(`UPDATE external_events SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run()

    // Fetch the updated event
    const updated = await db
      .prepare(`
        SELECT
          id,
          source,
          source_event_id,
          title,
          description,
          location,
          url,
          starts_at_utc,
          ends_at_utc,
          status,
          origin,
          visibility,
          created_by_person_id,
          updated_by_person_id
        FROM external_events
        WHERE id = ?
      `)
      .bind(externalEventId)
      .first<ExternalEvent>()

    return jsonResponse({
      external_event: updated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})

/**
 * DELETE /api/admin/external-events/:id
 * Delete a manual external event (only origin='manual' events can be deleted)
 */
export const onRequestDelete: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB
  const url = new URL(context.request.url)
  const externalEventId = context.params.id as string
  const clubId = url.searchParams.get('club_id')

  if (!clubId) {
    return errorResponse('club_id is required', 400)
  }

  try {
    // Get person record
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

    // Check that the event exists and is a manual event
    const existing = await db
      .prepare('SELECT id, origin FROM external_events WHERE id = ?')
      .bind(externalEventId)
      .first<{ id: string; origin: string | null }>()

    if (!existing) {
      return errorResponse('External event not found', 404)
    }

    if (existing.origin !== 'manual') {
      return errorResponse('Only manual events can be deleted', 400)
    }

    // Delete any associated links first
    await db
      .prepare('DELETE FROM external_event_links WHERE external_event_id = ?')
      .bind(externalEventId)
      .run()

    // Delete the event
    await db
      .prepare('DELETE FROM external_events WHERE id = ?')
      .bind(externalEventId)
      .run()

    return jsonResponse({
      success: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database error'
    return errorResponse(message, 500)
  }
})
