/**
 * SPA Catch-all for /app/* routes
 * Serves the React app's index.html for all /app/* routes
 * that don't match a static file
 */

export const onRequest: PagesFunction = async (context) => {
  // Try to get the static asset first
  const url = new URL(context.request.url)

  // If it's a static asset request (has file extension), let it pass through
  if (url.pathname.match(/\.[a-zA-Z0-9]+$/)) {
    return context.next()
  }

  // For all other /app/* routes, serve the app's index.html
  const appUrl = new URL('/app/index.html', url.origin)
  const response = await context.env.ASSETS.fetch(appUrl)

  return new Response(response.body, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
    },
  })
}
