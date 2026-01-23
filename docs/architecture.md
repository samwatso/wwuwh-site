# Architecture

> Technical decisions and structure for the WWUWH member app.

---

## Decision: React + TypeScript (Option B)

**Why React over vanilla JS:**

1. **Complex data model** — The D1 schema has 20+ tables with intricate relationships. TypeScript types prevent bugs and improve DX.

2. **Auth state management** — Supabase auth flows (login, signup, session refresh, protected routes) are cleaner with React Context/hooks.

3. **Component reusability** — Forms, cards, modals, and layouts will be reused across many pages. React components scale better than manual DOM manipulation.

4. **Incremental development** — The staged approach benefits from React's component isolation. Each stage adds features without rewriting earlier work.

5. **Maintainability** — Future developers (or you in 6 months) will find typed React easier to navigate than a custom vanilla router.

---

## Folder Structure

```
wwuwh-site/
├── index.html                 # Existing static home page
├── css/styles.css             # Existing global styles
├── js/                        # Existing static site JS
├── about/                     # Existing static pages
├── kit/
├── membership/
├── events/
├── connect/
├── privacy/
│
├── app/                       # NEW: React SPA
│   ├── index.html             # Vite entry point
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx           # React root
│   │   ├── App.tsx            # Router setup
│   │   ├── index.css          # App styles (imports design tokens)
│   │   │
│   │   ├── styles/
│   │   │   └── tokens.css     # Design tokens (matches main site)
│   │   │
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── FormField.tsx
│   │   │   ├── Spinner.tsx
│   │   │   └── ...
│   │   │
│   │   ├── pages/             # Route pages
│   │   │   ├── Login.tsx
│   │   │   ├── Signup.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── ...
│   │   │
│   │   ├── hooks/             # Custom hooks
│   │   │   └── useAuth.ts
│   │   │
│   │   ├── lib/               # Utilities and clients
│   │   │   ├── supabase.ts    # Supabase client
│   │   │   └── api.ts         # D1 API client (STAGE 3+)
│   │   │
│   │   └── types/             # TypeScript types
│   │       └── database.ts    # Types from D1 schema
│   │
│   └── public/                # Static assets for app
│
├── functions/                 # Cloudflare Pages Functions (STAGE 3+)
│   └── api/
│       ├── health.ts
│       └── ...
│
├── db/
│   └── schema.sql             # D1 schema (source of truth)
│
└── docs/
    ├── architecture.md        # This file
    └── data-model.md          # Schema documentation
```

---

## Design System

The app reuses the existing site's design tokens to maintain visual consistency.

### Tokens (from `css/styles.css`)

```css
/* Colours */
--color-navy: #1e2b60;       /* Primary, headings */
--color-water: #5ab9e7;      /* Accent, focus, links */
--color-deep-navy: #0f1733;  /* Dark backgrounds */
--color-ice: #dff3ff;        /* Light backgrounds */
--grey-100: #f5f7fb;         /* Page background */
--grey-700: #2b2f3a;         /* Body text */

/* Typography */
--font-display: "Azonix", system-ui, sans-serif;
--font-body: "Nexa Light", system-ui, sans-serif;

/* Spacing */
--space-xs: 0.5rem;
--space-sm: 1rem;
--space-md: 1.5rem;
--space-lg: 2.5rem;
--space-xl: 4rem;

/* Radii */
--radius-sm: 8px;
--radius-md: 12px;
--radius-btn: 16px;
--radius-card: 20px;
```

### Component Patterns

**Buttons:**
- Primary: `--color-water` background, white text
- Secondary: transparent with `--color-navy` border
- Pill shape: `--radius-btn-pill` (999px)

**Inputs:**
- Border: `--grey-300`
- Focus: `--color-water` ring
- Error: red border + error message below
- Radius: `--radius-md`

**Cards:**
- Background: `--color-white`
- Shadow: `--shadow-soft`
- Radius: `--radius-card`

---

## Authentication Flow

### Supabase Setup
- **Auth method:** Email + Password
- **Future:** Magic link (STAGE 5+)
- **Session:** Stored in localStorage by Supabase client
- **Token refresh:** Handled automatically by Supabase

### Flow Diagram
```
┌─────────────────────────────────────────────────────────────┐
│  /app/login                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Email + Password form                               │   │
│  │  [Sign In] button                                    │   │
│  │  "Don't have an account?" → /app/signup             │   │
│  │  "Forgot password?" → TODO (STAGE 5+)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│              supabase.auth.signInWithPassword()            │
│                           │                                 │
│                           ▼                                 │
│              ┌──────────────────────┐                      │
│              │ Session stored       │                      │
│              │ Redirect to /app     │                      │
│              └──────────────────────┘                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  /app (Dashboard)                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AuthGuard checks session                            │   │
│  │  - No session → redirect to /app/login              │   │
│  │  - Valid session → render Dashboard                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  STAGE 4: On first load, call API to ensure person         │
│  record exists in D1 linked to auth_user_id                │
└─────────────────────────────────────────────────────────────┘
```

---

## API Layer (STAGE 3+)

### Cloudflare Pages Functions
Located in `/functions/api/*`. Each function:
- Receives D1 binding via `context.env.DB`
- Validates auth token from request header
- Returns JSON responses

### Endpoints (planned)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Check D1 connectivity |
| GET | `/api/me` | Get current user's person record |
| POST | `/api/me` | Create/update person record |
| GET | `/api/clubs/:id` | Get club details |
| GET | `/api/events` | List upcoming events |
| POST | `/api/events/:id/rsvp` | RSVP to an event |

---

## Environment Variables

### Local Development (`.env` in `/app`)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Cloudflare Pages Dashboard
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

For STAGE 3+, add D1 binding:
```
[[d1_databases]]
binding = "DB"
database_name = "wwuwh"
database_id = "xxx"
```

---

## Routing

Using `react-router-dom` v6:

| Path | Component | Auth Required |
|------|-----------|---------------|
| `/app/login` | Login | No |
| `/app/signup` | Signup | No |
| `/app` | Dashboard | Yes |
| `/app/events` | Events list | Yes |
| `/app/profile` | User profile | Yes |

### Route Protection
```tsx
<Route element={<AuthGuard />}>
  <Route path="/app" element={<Dashboard />} />
  <Route path="/app/events" element={<Events />} />
</Route>
```

---

## Mobile-First Patterns

### Breakpoints
```css
/* Mobile first - no media query needed */
/* Tablet: min-width: 768px */
/* Desktop: min-width: 1024px */
```

### Touch Targets
- Minimum 44×44px for all interactive elements
- Generous padding on form fields

### Layout
- Single column on mobile
- Max-width container centred on larger screens
- Bottom navigation for STAGE 2+ (mobile)

---

## Stage Roadmap

| Stage | Focus | Status |
|-------|-------|--------|
| 0 | Scaffold, docs, design tokens | Complete |
| 1 | Auth UI (Login, Signup) | Complete |
| 2 | Session guard, logout, mobile nav | Complete |
| 3 | D1 API layer, health endpoint | Complete |
| 4 | User profile bootstrap | Complete |
| 5a | Events list, RSVP | Complete |
| 5b | Payments, Stripe integration | TODO |

---

## Running Locally

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173/app`

### With Cloudflare Pages Functions (STAGE 3+)
```bash
npx wrangler pages dev --d1 DB=wwuwh -- npm run dev
```
