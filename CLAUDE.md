# Claude Context for WWUWH Project

This file provides context for AI assistants working on the West Wickham Underwater Hockey Club codebase.

## Project Overview

A club management system with:
1. **Static marketing website** — vanilla HTML/CSS/JS at root level
2. **Member app** — React + TypeScript + Capacitor in `/app`
3. **Backend API** — Cloudflare Workers in `/functions`
4. **Database** — Cloudflare D1 (SQLite) with schema in `/db`

## Architecture Decisions

### Why Cloudflare Workers + D1?
- Edge deployment for low latency
- SQLite-based D1 is simple and cost-effective
- No cold starts compared to traditional serverless
- Integrated with Cloudflare Pages for hosting

### Why Capacitor over React Native?
- Same React codebase for web and native
- Native iOS/Android from single build
- Access to native APIs (camera, push notifications)
- Easier web-to-native migration path

### Why Supabase Auth (not Cloudflare)?
- Mature auth solution with email/password, magic links
- Client-side SDK that works in Capacitor
- JWT tokens validated on the backend

## Key Files to Know

### Backend
- `functions/types.ts` — shared types, `Env` interface, response helpers
- `functions/middleware/auth.ts` — JWT validation, `withAuth` wrapper
- `functions/middleware/admin.ts` — admin role checking
- `functions/lib/awards-service.ts` — badge granting logic (called from multiple hooks)
- `functions/lib/push.ts` — unified push notification service (APNs + FCM)

### Frontend
- `app/src/lib/api.ts` — typed API client with auth headers
- `app/src/hooks/useAuth.ts` — authentication state management
- `app/src/hooks/useProfile.tsx` — user profile and memberships
- `app/src/hooks/useEvents.ts` — event fetching and RSVP handling
- `app/src/hooks/useAwards.ts` — badge/award data

### Database
- `db/schema.sql` — complete schema (source of truth)
- `db/migrations/` — incremental migrations (numbered sequentially)

## Common Patterns

### API Endpoints
```typescript
// All endpoints use withAuth for authentication
export const onRequestGet: PagesFunction<Env> = withAuth(async (context, user) => {
  const db = context.env.WWUWH_DB

  // Get person from auth user
  const person = await db
    .prepare('SELECT id FROM people WHERE auth_user_id = ?')
    .bind(user.id)
    .first<{ id: string }>()

  // ... endpoint logic

  return jsonResponse({ data })
})
```

### Admin Endpoints
```typescript
// Check admin role after getting person
const adminCheck = await isAdmin(db, person.id, clubId)
if (!adminCheck) {
  return errorResponse('Admin access required', 403)
}
```

### React Hooks
```typescript
// Hooks return loading/error states
const { data, loading, error, refresh } = useEvents({ clubId })
```

## Database Conventions

- All IDs are UUIDs stored as TEXT
- Timestamps use ISO 8601 format: `strftime('%Y-%m-%dT%H:%M:%fZ','now')`
- Foreign keys use ON DELETE CASCADE or SET NULL
- Indexes named: `idx_{table}_{columns}`

## Event System

Events have:
- `kind`: session, training, ladies, tournament, match, social, other
- `payment_mode`: included (subscription), pay_session, free
- `visibility`: public, members, invited
- `visible_from` / `visible_until`: control when event appears

RSVP flow:
1. User RSVP's to event
2. Subscription usage tracked if applicable
3. Awards checked and granted via `checkAndGrantAwards()`

## Awards System

Awards are granted automatically by `awards-service.ts`:

Triggers:
- `rsvp` — when user RSVP's yes
- `attendance` — when admin marks attendance
- `team_assigned` — when user assigned to team
- `profile_load` — when user views awards page
- `scheduled` — cron job for time-based awards

The `grantAward()` function:
1. Inserts into `person_awards` (idempotent via INSERT OR IGNORE)
2. Looks up award name/description
3. Sends push notification via `sendBadgeUnlockNotification()`

## Push Notifications

Supported platforms:
- iOS via APNs (Apple Push Notification service)
- Android via FCM (Firebase Cloud Messaging)

Token registration:
1. App requests permission
2. Capacitor plugin gets device token
3. Token sent to `/api/me/device-token`
4. Stored in `device_tokens` table with platform

Sending notifications:
- Event invites: `sendEventInvitationNotifications()`
- Badge unlocks: `sendBadgeUnlockNotification()`

## Stripe Integration

Subscription flow:
1. Plans defined in `billing_plans` table
2. User selects plan, redirected to Stripe Checkout
3. Webhook creates `member_subscriptions` record
4. Subscription usage tracked in `subscription_usages`

Webhook events handled:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

## Testing Locally

```bash
# Frontend
cd app && npm run dev

# Backend (requires wrangler)
npx wrangler pages dev --local

# iOS app
cd app && npm run ios
```

## Deployment

- Frontend + API: Cloudflare Pages (auto-deploys from main branch)
- iOS: Build in Xcode, submit via App Store Connect
- Android: Build in Android Studio, submit via Play Console

## Code Style

- TypeScript strict mode
- Functional React components with hooks
- CSS Modules for component styles
- No emojis in code/comments unless user-facing
- Console.logs prefixed with context: `[Auth]`, `[Push]`, `[AwardsService]`

## Things to Avoid

- Don't add unnecessary abstractions or "future-proofing"
- Don't refactor code that isn't part of the current task
- Don't add comments to code you didn't change
- Don't create new files unless necessary (prefer editing existing)
- Don't use `git push --force` or amend pushed commits
