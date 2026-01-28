/**
 * Awards Cron Endpoint
 * POST /api/cron/awards - Trigger awards check for all active users
 *
 * Secured by CRON_SECRET header - call from GitHub Actions
 */

import { Env, jsonResponse, errorResponse } from '../../types'
import { checkAwardsForAllUsers } from '../../lib/awards-service'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.WWUWH_DB

  // Verify cron secret
  const cronSecret = context.request.headers.get('X-Cron-Secret')
  const expectedSecret = context.env.CRON_SECRET

  if (!expectedSecret || cronSecret !== expectedSecret) {
    return errorResponse('Unauthorized', 401)
  }

  try {
    const result = await checkAwardsForAllUsers(context.env, db)

    return jsonResponse({
      success: true,
      checked: result.checked,
      awarded: result.awarded,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process awards'
    return errorResponse(message, 500)
  }
}
