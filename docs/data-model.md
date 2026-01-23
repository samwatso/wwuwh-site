# Data Model

> Generated from `db/schema.sql` — Cloudflare D1 schema for WWUWH club management.

---

## Entity Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE ENTITIES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  clubs ─────────┬──── people (via club_memberships)                         │
│                 │                                                           │
│                 ├──── groups (teams/squads/committees)                      │
│                 │       └── group_members                                   │
│                 │                                                           │
│                 ├──── event_series ──── events                              │
│                 │                         ├── event_rsvps                   │
│                 │                         └── event_attendance              │
│                 │                                                           │
│                 ├──── billing_plans ──── member_subscriptions               │
│                 │                         └── subscription_usages           │
│                 │                                                           │
│                 ├──── payment_requests ──── payment_request_recipients      │
│                 │                                                           │
│                 ├──── transactions ──── refund_requests                     │
│                 │                                                           │
│                 └──── audit_log                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tables

### 1. `clubs`
The root entity. All data is scoped to a club.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key (UUID) |
| `name` | TEXT | Club name |
| `timezone` | TEXT | Default: `Europe/London` |
| `created_at` | TEXT | ISO timestamp |
| `archived_at` | TEXT | Soft delete |

---

### 2. `people`
All users/members. Links to Supabase auth via `auth_user_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key (UUID) |
| `auth_user_id` | TEXT | **Supabase auth.users.id** (unique) |
| `name` | TEXT | Display name |
| `email` | TEXT | Contact email |
| `medical_flag` | INTEGER | 0/1 — has medical notes |
| `rating` | INTEGER | Optional skill rating |
| `notes_private` | TEXT | Admin-only notes |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

**Indexes:** `email`, `auth_user_id`

---

### 3. `club_memberships`
Links people to clubs with membership status.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `person_id` | TEXT | FK → people |
| `member_type` | TEXT | `member` \| `guest` |
| `status` | TEXT | `invited` \| `active` \| `suspended` \| `left` |
| `joined_at` | TEXT | When membership started |
| `left_at` | TEXT | When membership ended |

**Unique:** `(club_id, person_id)`

---

### 4. `club_roles`
Defines roles available within a club.

| Column | Type | Notes |
|--------|------|-------|
| `club_id` | TEXT | FK → clubs |
| `role_key` | TEXT | e.g. `admin`, `captain`, `treasurer` |
| `name` | TEXT | Display name |
| `permissions_json` | TEXT | JSON permissions object |

**Primary key:** `(club_id, role_key)`

---

### 5. `club_member_roles`
Assigns roles to members.

| Column | Type | Notes |
|--------|------|-------|
| `club_id` | TEXT | FK → clubs |
| `person_id` | TEXT | FK → people |
| `role_key` | TEXT | FK → club_roles |

**Primary key:** `(club_id, person_id, role_key)`

---

### 6. `invitations`
Pending invitations to join a club.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `email` | TEXT | Invitee email |
| `name_hint` | TEXT | Suggested name |
| `member_type` | TEXT | `member` \| `guest` |
| `role_key` | TEXT | Optional initial role |
| `group_id` | TEXT | Optional initial group |
| `token_hash` | TEXT | Hashed invite token |
| `expires_at` | TEXT | Expiry timestamp |
| `accepted_at` | TEXT | When accepted |

---

### 7. `groups`
Teams, squads, committees within a club.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `name` | TEXT | Group name |
| `kind` | TEXT | `team` \| `committee` \| `squad` \| `other` |
| `description` | TEXT | Optional |
| `archived_at` | TEXT | Soft delete |

---

### 8. `group_members`
Links people to groups with a role.

| Column | Type | Notes |
|--------|------|-------|
| `group_id` | TEXT | FK → groups |
| `person_id` | TEXT | FK → people |
| `group_role` | TEXT | `member` \| `coach` \| `captain` \| `admin` |

**Primary key:** `(group_id, person_id)`

---

### 9. `event_series`
Recurring event templates (e.g. weekly sessions).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `group_id` | TEXT | FK → groups (optional) |
| `title` | TEXT | Series name |
| `location` | TEXT | Venue |
| `weekday_mask` | INTEGER | Bitmask for days (Mon=1, Tue=2, etc.) |
| `start_time_local` | TEXT | e.g. `21:00` |
| `duration_min` | INTEGER | Default: 60 |
| `start_date` | TEXT | Series start |
| `end_date` | TEXT | Series end (optional) |
| `default_fee_cents` | INTEGER | Per-event fee |
| `currency` | TEXT | Default: `GBP` |

---

### 10. `events`
Individual events (sessions, matches, tournaments, socials).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `group_id` | TEXT | FK → groups (optional) |
| `series_id` | TEXT | FK → event_series (optional) |
| `kind` | TEXT | `session` \| `match` \| `tournament` \| `social` \| `other` |
| `title` | TEXT | Event name |
| `description` | TEXT | Optional |
| `location` | TEXT | Venue |
| `starts_at_utc` | TEXT | ISO timestamp (UTC) |
| `ends_at_utc` | TEXT | ISO timestamp (UTC) |
| `timezone` | TEXT | For display |
| `capacity` | INTEGER | Max attendees |
| `status` | TEXT | `scheduled` \| `cancelled` \| `completed` |
| `payment_mode` | TEXT | `included` \| `one_off` \| `free` |
| `fee_cents` | INTEGER | Event fee |
| `currency` | TEXT | Default: `GBP` |
| `created_by_person_id` | TEXT | FK → people |

---

### 11. `event_rsvps`
Member responses to events.

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | TEXT | FK → events |
| `person_id` | TEXT | FK → people |
| `response` | TEXT | `yes` \| `no` \| `maybe` |
| `responded_at` | TEXT | ISO timestamp |
| `note` | TEXT | Optional message |

**Primary key:** `(event_id, person_id)`

---

### 12. `event_attendance`
Actual attendance records.

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | TEXT | FK → events |
| `person_id` | TEXT | FK → people |
| `status` | TEXT | `present` \| `absent` \| `late` \| `excused` |
| `checked_in_at` | TEXT | ISO timestamp |

**Primary key:** `(event_id, person_id)`

---

### 13. `billing_plans`
Subscription tiers (monthly membership).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `name` | TEXT | Plan name |
| `cadence` | TEXT | `month` only |
| `weekly_sessions_allowed` | INTEGER | 1 or 2 |
| `price_cents` | INTEGER | Monthly price |
| `currency` | TEXT | Default: `GBP` |
| `stripe_price_id` | TEXT | Stripe integration |
| `active` | INTEGER | 0/1 |

---

### 14. `member_subscriptions`
Active subscriptions linking members to plans.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `person_id` | TEXT | FK → people |
| `plan_id` | TEXT | FK → billing_plans |
| `status` | TEXT | `active` \| `past_due` \| `paused` \| `cancelled` |
| `start_at` | TEXT | Subscription start |
| `end_at` | TEXT | Subscription end |
| `stripe_customer_id` | TEXT | Stripe customer |
| `stripe_subscription_id` | TEXT | Stripe subscription |

---

### 15. `subscription_usages`
Tracks which events a subscription was used for.

| Column | Type | Notes |
|--------|------|-------|
| `subscription_id` | TEXT | FK → member_subscriptions |
| `event_id` | TEXT | FK → events |
| `used_at` | TEXT | ISO timestamp |

**Primary key:** `(subscription_id, event_id)`

---

### 16. `payment_requests`
One-off payment requests (tournament fees, kit, etc.).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `event_id` | TEXT | FK → events (optional) |
| `name` | TEXT | Request name |
| `description` | TEXT | Optional |
| `amount_cents` | INTEGER | Total amount |
| `currency` | TEXT | Default: `GBP` |
| `due_at` | TEXT | Due date |
| `status` | TEXT | `open` \| `closed` \| `cancelled` |
| `created_by_person_id` | TEXT | FK → people |

---

### 17. `payment_request_recipients`
Links payment requests to people who owe.

| Column | Type | Notes |
|--------|------|-------|
| `payment_request_id` | TEXT | FK → payment_requests |
| `person_id` | TEXT | FK → people |
| `amount_cents` | INTEGER | Individual amount (can differ) |
| `status` | TEXT | `due` \| `paid` \| `waived` |

**Primary key:** `(payment_request_id, person_id)`

---

### 18. `transactions`
All financial transactions (charges, refunds, adjustments).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `person_id` | TEXT | FK → people |
| `event_id` | TEXT | FK → events (optional) |
| `payment_request_id` | TEXT | FK → payment_requests (optional) |
| `source` | TEXT | `stripe` \| `cash` \| `manual` |
| `type` | TEXT | `charge` \| `refund` \| `adjustment` |
| `amount_cents` | INTEGER | Amount (negative for refunds) |
| `currency` | TEXT | Default: `GBP` |
| `status` | TEXT | `pending` \| `succeeded` \| `failed` \| `cancelled` |
| `stripe_payment_intent_id` | TEXT | Stripe PI |
| `stripe_charge_id` | TEXT | Stripe charge |
| `stripe_refund_id` | TEXT | Stripe refund |
| `collected_by_person_id` | TEXT | Who collected (cash) |
| `effective_at` | TEXT | When funds were applied |

---

### 19. `refund_requests`
Refund request workflow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `original_transaction_id` | TEXT | FK → transactions |
| `requested_by_person_id` | TEXT | FK → people |
| `reason` | TEXT | Reason for refund |
| `status` | TEXT | `requested` \| `approved` \| `declined` \| `processed` |
| `reviewed_by_person_id` | TEXT | FK → people |
| `reviewed_at` | TEXT | ISO timestamp |

---

### 20. `audit_log`
Tracks all significant actions for compliance.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key |
| `club_id` | TEXT | FK → clubs |
| `actor_person_id` | TEXT | FK → people (who did it) |
| `action` | TEXT | Action type |
| `entity_type` | TEXT | Table/entity affected |
| `entity_id` | TEXT | ID of affected row |
| `metadata_json` | TEXT | Additional context |

---

## Key Relationships

### Auth → Person
```
Supabase auth.users.id  →  people.auth_user_id
```
On first login, create/link a `people` row using the auth user ID.

### Multi-tenancy
All data is scoped to `club_id`. A person can belong to multiple clubs via `club_memberships`.

### Events Flow
```
event_series (template) → events (instances)
                              ↓
                         event_rsvps (intentions)
                              ↓
                         event_attendance (actual)
```

### Billing Flow
```
billing_plans → member_subscriptions → subscription_usages
                                            ↓
                                        events (attended)
```

### Payments Flow
```
payment_requests → payment_request_recipients
                          ↓
                     transactions
                          ↓
                     refund_requests (if needed)
```

---

## Stage TODOs

### STAGE 3 — D1 Integration
- [ ] Create `/functions/api/health.ts` — check D1 connectivity
- [ ] Create `/functions/api/clubs/[id].ts` — get club by ID
- [ ] Create `/functions/api/events/index.ts` — list events for club
- [ ] Create `/functions/api/events/[id]/rsvp.ts` — RSVP to event

### STAGE 4 — User Profile Bootstrap
- [ ] On first auth, call API to upsert `people` row with `auth_user_id`
- [ ] Fetch `club_memberships` for user
- [ ] Fetch `club_member_roles` for permissions

### STAGE 5+ — Future
- [ ] Event CRUD (admin only)
- [ ] Attendance tracking
- [ ] Subscription management
- [ ] Payment request workflow
- [ ] Stripe integration
