/**
 * Awards Cron Worker
 *
 * Runs daily via Cloudflare Cron Trigger.
 * Calls the awards check endpoint on the Pages project via service binding,
 * bypassing Cloudflare's public bot protection.
 */

interface Env {
  WWUWH_SITE: Fetcher
  CRON_SECRET: string
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[AwardsCron] Running scheduled awards check...')

    try {
      const response = await env.WWUWH_SITE.fetch('https://wwuwh.com/api/cron/awards', {
        method: 'POST',
        headers: {
          'X-Cron-Secret': env.CRON_SECRET,
          'Content-Type': 'application/json',
        },
      })

      const body = await response.text()
      console.log(`[AwardsCron] Response ${response.status}: ${body}`)

      if (!response.ok) {
        throw new Error(`Awards check failed with status ${response.status}: ${body}`)
      }
    } catch (error) {
      console.error('[AwardsCron] Error:', error)
      throw error
    }
  },
}
