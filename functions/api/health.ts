/**
 * Health Check Endpoint
 * GET /api/health
 *
 * Checks:
 * - API is responding
 * - D1 database is connected
 * - Returns table counts for verification
 */

import { Env, jsonResponse, errorResponse } from '../types'

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  checks: {
    api: boolean
    d1: boolean
    tables?: {
      clubs: number
      people: number
      events: number
    }
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const startTime = Date.now()

  const health: HealthData = {
    status: 'healthy',
    version: '0.1.0',
    checks: {
      api: true,
      d1: false,
    },
  }

  try {
    // Check D1 connectivity by running a simple query
    const db = context.env.WWUWH_DB

    if (!db) {
      health.status = 'unhealthy'
      health.checks.d1 = false
      return jsonResponse(
        { ...health, latency_ms: Date.now() - startTime },
        503
      )
    }

    // Get table counts to verify schema is in place
    const [clubsResult, peopleResult, eventsResult] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM clubs').first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) as count FROM people').first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) as count FROM events').first<{ count: number }>(),
    ])

    health.checks.d1 = true
    health.checks.tables = {
      clubs: clubsResult?.count ?? 0,
      people: peopleResult?.count ?? 0,
      events: eventsResult?.count ?? 0,
    }

    return jsonResponse({
      ...health,
      latency_ms: Date.now() - startTime,
    })
  } catch (error) {
    health.status = 'unhealthy'
    health.checks.d1 = false

    const message = error instanceof Error ? error.message : 'Unknown error'

    return jsonResponse(
      {
        ...health,
        error: message,
        latency_ms: Date.now() - startTime,
      },
      503
    )
  }
}
