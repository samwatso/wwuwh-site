-- WWUWH Seed Data
-- Run with: npx wrangler d1 execute wwuwh-prod --local --file=db/seed.sql

-- ============================================
-- CLUB
-- ============================================
INSERT OR IGNORE INTO clubs (id, name, timezone)
VALUES ('wwuwh-001', 'West Wickham Underwater Hockey', 'Europe/London');

-- ============================================
-- DEFAULT ROLES
-- ============================================
INSERT OR IGNORE INTO club_roles (club_id, role_key, name, permissions_json)
VALUES
  ('wwuwh-001', 'admin', 'Administrator', '{"all": true}'),
  ('wwuwh-001', 'captain', 'Team Captain', '{"events.manage": true, "members.view": true}'),
  ('wwuwh-001', 'member', 'Member', '{"events.view": true, "events.rsvp": true}');

-- ============================================
-- EVENT SERIES (Weekly Sessions)
-- ============================================
-- Monday session at Downham
INSERT OR IGNORE INTO event_series (
  id, club_id, title, description, location,
  weekday_mask, start_time_local, duration_min,
  start_date, default_fee_cents, currency
) VALUES (
  'series-mon-downham',
  'wwuwh-001',
  'Monday Session',
  'Weekly training session at Downham Health & Leisure Centre',
  'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
  1,  -- Monday (bit 0)
  '21:00',
  90,
  '2024-01-01',
  700,  -- £7.00
  'GBP'
);

-- Thursday session at Caterham
INSERT OR IGNORE INTO event_series (
  id, club_id, title, description, location,
  weekday_mask, start_time_local, duration_min,
  start_date, default_fee_cents, currency
) VALUES (
  'series-thu-caterham',
  'wwuwh-001',
  'Thursday Session',
  'Weekly training session at de Stafford School',
  'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
  8,  -- Thursday (bit 3)
  '20:30',
  90,
  '2024-01-01',
  700,  -- £7.00
  'GBP'
);

-- ============================================
-- SAMPLE EVENTS (Next 4 weeks of sessions)
-- ============================================

-- Helper: Generate events for next 4 weeks
-- Monday sessions (21:00-22:30)
INSERT OR IGNORE INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  -- Week 1
  ('evt-mon-2025-01-27', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2025-01-27T21:00:00Z', '2025-01-27T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week 2
  ('evt-mon-2025-02-03', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2025-02-03T21:00:00Z', '2025-02-03T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week 3
  ('evt-mon-2025-02-10', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2025-02-10T21:00:00Z', '2025-02-10T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week 4
  ('evt-mon-2025-02-17', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2025-02-17T21:00:00Z', '2025-02-17T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP');

-- Thursday sessions (20:30-22:00)
INSERT OR IGNORE INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  -- Week 1
  ('evt-thu-2025-01-30', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2025-01-30T20:30:00Z', '2025-01-30T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week 2
  ('evt-thu-2025-02-06', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2025-02-06T20:30:00Z', '2025-02-06T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week 3
  ('evt-thu-2025-02-13', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2025-02-13T20:30:00Z', '2025-02-13T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week 4
  ('evt-thu-2025-02-20', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2025-02-20T20:30:00Z', '2025-02-20T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP');

-- ============================================
-- BILLING PLANS
-- ============================================
INSERT OR IGNORE INTO billing_plans (
  id, club_id, name, cadence, weekly_sessions_allowed, price_cents, currency, active
) VALUES
  ('plan-1x-week', 'wwuwh-001', 'Once Weekly', 'month', 1, 2500, 'GBP', 1),
  ('plan-2x-week', 'wwuwh-001', 'Twice Weekly', 'month', 2, 4000, 'GBP', 1);
