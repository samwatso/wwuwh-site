# West Wickham Underwater Hockey Club

Static website and member app for West Wickham Underwater Hockey Club (WWUWH) — a South London club established in 1973, hosting, coaching, and competing in underwater hockey (Octopush).

**Live site:** [wwuwh.com](https://wwuwh.com)
**Member app:** [wwuwh.com/app](https://wwuwh.com/app) (also available on iOS App Store)

---

## Project Structure

```
/
├── index.html                 # Static site home page
├── about/                     # Static site - club info pages
├── kit/                       # Static site - equipment guide
├── membership/                # Static site - membership info
├── events/                    # Static site - public calendar
├── connect/                   # Static site - social links
├── privacy/                   # Static site - privacy policy
│
├── app/                       # Member App (React + Capacitor)
│   ├── src/                   # React source code
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Page components
│   │   ├── lib/               # Utilities and API client
│   │   └── types/             # TypeScript type definitions
│   ├── ios/                   # iOS native project (Capacitor)
│   └── android/               # Android native project (Capacitor)
│
├── functions/                 # Backend API (Cloudflare Workers)
│   ├── api/                   # API endpoints
│   │   ├── admin/             # Admin-only endpoints
│   │   ├── events/            # Event management
│   │   ├── me/                # User profile & awards
│   │   ├── webhooks/          # Stripe webhooks
│   │   └── cron/              # Scheduled tasks
│   ├── lib/                   # Shared backend utilities
│   │   ├── apns.ts            # Apple Push Notifications
│   │   ├── fcm.ts             # Firebase Cloud Messaging
│   │   ├── push.ts            # Unified push service
│   │   └── awards-service.ts  # Badge/award granting logic
│   └── middleware/            # Auth and admin middleware
│
├── db/                        # Database
│   ├── schema.sql             # Full database schema
│   ├── migrations/            # Sequential migrations
│   └── seed*.sql              # Development seed data
│
└── public/                    # Static assets served by app
    └── badges/                # Badge SVG icons
```

---

## Tech Stack

### Static Website
- **HTML5** — semantic markup
- **CSS** — single stylesheet, CSS variables, mobile-first
- **JavaScript** — vanilla JS, modular files

### Member App
- **React 18** — UI framework
- **TypeScript** — type safety
- **Vite** — build tool
- **Capacitor 8** — native iOS/Android builds
- **React Router** — client-side routing

### Backend
- **Cloudflare Workers** — serverless API
- **Cloudflare D1** — SQLite database
- **Supabase Auth** — authentication
- **Stripe** — subscription payments
- **APNs / FCM** — push notifications

---

## Member App Features

### For Members
- **Event Calendar** — view upcoming sessions, tournaments, matches
- **RSVP** — respond to events with yes/no/maybe
- **Team Assignments** — see which team you're on for sessions
- **Badge Collection** — earn and display achievement badges
- **Subscriptions** — manage membership payments via Stripe
- **Push Notifications** — get notified about event invites and badge unlocks
- **Profile** — manage name, photo, notification preferences

### For Admins
- **Event Management** — create, edit, duplicate events
- **Invitations** — invite members or groups to events
- **Team Builder** — assign players to teams and positions
- **Attendance** — mark players as present/absent
- **Member Management** — view members, manage roles
- **Billing** — manage subscriptions, pricing tiers
- **Groups** — create member groups for easy invitations

---

## Database Schema

Key tables:
- `clubs` — club configuration
- `people` — member profiles
- `club_memberships` — member-club relationships
- `events` — sessions, tournaments, matches, socials
- `event_rsvps` — member responses to events
- `event_teams` — teams for an event (White/Black)
- `event_team_assignments` — player-team-position assignments
- `event_invitations` — who's invited to events
- `groups` / `group_members` — reusable member groups
- `billing_plans` / `member_subscriptions` — subscription management
- `awards` / `person_awards` — badge definitions and grants
- `device_tokens` — push notification tokens

---

## Awards System

Members earn badges automatically based on their activity:

**Streaks:** First Dip, Back-to-Back, Triple Threat, Perfect Week, etc.
**Milestones:** 5/10/25/50/100/200 Sessions, Season Centurion
**Reliability:** On Time, Dependable, Ironclad, Always Ready
**Positions:** Forward Line, Wing Runner, Centre Control, Backline Anchor
**Competition:** First Friendly, Tournament Debut, Road Trip, Finals Ready
**Anniversaries:** 1 Year, 5 Years, 10 Years

Badges are granted via `awards-service.ts` and trigger push notifications.

---

## Environment Variables

### Cloudflare Workers (wrangler.toml / secrets)
```
WWUWH_DB              # D1 database binding
SUPABASE_URL          # Supabase project URL
SUPABASE_SERVICE_KEY  # Supabase service role key
STRIPE_SECRET_KEY     # Stripe API key
STRIPE_WEBHOOK_SECRET # Stripe webhook signing secret
APNS_KEY_ID           # Apple Push Notification key ID
APNS_TEAM_ID          # Apple Developer Team ID
APNS_BUNDLE_ID        # iOS app bundle identifier
APNS_PRIVATE_KEY      # APNs .p8 key (base64 encoded)
FCM_PROJECT_ID        # Firebase project ID
FCM_PRIVATE_KEY       # Firebase service account key
FCM_CLIENT_EMAIL      # Firebase client email
```

### App (.env)
```
VITE_SUPABASE_URL     # Supabase project URL
VITE_SUPABASE_ANON_KEY # Supabase anonymous key
VITE_API_BASE_URL     # API base URL (/ for prod, http://localhost:8788 for dev)
```

---

## Development

### Static Site
Just open HTML files in browser or use any static server.

### Member App
```bash
cd app
npm install
npm run dev           # Start Vite dev server
npm run build         # Build for production
npm run ios           # Build and open in Xcode
npm run android       # Build and open in Android Studio
```

### Backend API
```bash
# Install wrangler globally
npm install -g wrangler

# Run local dev server
npx wrangler pages dev --local

# Deploy to Cloudflare
npx wrangler pages deploy
```

### Database Migrations
```bash
# Run a migration
npx wrangler d1 execute WWUWH_DB --file=db/migrations/XXX-name.sql

# Run against local dev database
npx wrangler d1 execute WWUWH_DB --local --file=db/migrations/XXX-name.sql
```

---

## Sessions

| Day | Time | Venue | Who |
|-----|------|-------|-----|
| Wednesday | 9–10 PM | South Norwood Leisure Centre | Members & Guests |
| Thursday | 9–10 PM | Downham Leisure Centre | Members & Guests |
| Sunday | 3:30–4:30 PM | De Stafford Sports Centre, Caterham | Juniors |

---

## Links

- **Website:** [wwuwh.com](https://wwuwh.com)
- **Member App:** [wwuwh.com/app](https://wwuwh.com/app)
- **Instagram:** [@wwuwh](https://instagram.com/wwuwh)
- **Facebook:** [westwickhamuwh](https://facebook.com/westwickhamuwh)
- **YouTube:** [West Wickham UWH](https://youtube.com/channel/UCdokEqYEbzyqtcgUGdhz6xw)

---

## Affiliation

Member of the [British Octopush Association (BOA)](https://www.gbuwh.co.uk/)

---

*Est. 1973*
