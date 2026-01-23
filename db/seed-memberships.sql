-- WWUWH Real Membership Plans
-- Run with: npx wrangler d1 execute wwuwh-prod --local --persist-to=.wrangler/state --file=db/seed-memberships.sql

-- ============================================
-- CLEAR OLD TEST DATA
-- ============================================
DELETE FROM billing_plans WHERE club_id = 'wwuwh-001';
DELETE FROM events WHERE club_id = 'wwuwh-001';
DELETE FROM event_series WHERE club_id = 'wwuwh-001';

-- ============================================
-- BILLING PLANS (Real Membership Tiers)
-- ============================================

-- Multi Swim - 2 sessions per week (Wed + Thu)
INSERT INTO billing_plans (id, club_id, name, cadence, weekly_sessions_allowed, price_cents, currency, active)
VALUES
  ('plan-multi-adult', 'wwuwh-001', 'Multi Swim (Adult)', 'month', 2, 4800, 'GBP', 1),
  ('plan-multi-student', 'wwuwh-001', 'Multi Swim (Student)', 'month', 2, 3500, 'GBP', 1);

-- Single Swim - 1 session per week (Wed or Thu)
INSERT INTO billing_plans (id, club_id, name, cadence, weekly_sessions_allowed, price_cents, currency, active)
VALUES
  ('plan-single-adult', 'wwuwh-001', 'Single Swim (Adult)', 'month', 1, 3100, 'GBP', 1),
  ('plan-single-student', 'wwuwh-001', 'Single Swim (Student)', 'month', 1, 2000, 'GBP', 1);

-- Junior - 1 session per week (Sunday only)
INSERT INTO billing_plans (id, club_id, name, cadence, weekly_sessions_allowed, price_cents, currency, active)
VALUES
  ('plan-junior', 'wwuwh-001', 'Junior Membership', 'month', 1, 3000, 'GBP', 1);

-- ============================================
-- EVENT SERIES (Weekly Sessions)
-- ============================================

-- Wednesday session
INSERT INTO event_series (
  id, club_id, title, description, location,
  weekday_mask, start_time_local, duration_min,
  start_date, default_fee_cents, currency
) VALUES (
  'series-wed',
  'wwuwh-001',
  'Wednesday Session',
  'Weekly training session',
  'TBC',
  4,  -- Wednesday (bit 2)
  '20:30',
  90,
  '2024-01-01',
  1000,  -- £10.00 guest/non-member price
  'GBP'
);

-- Thursday session
INSERT INTO event_series (
  id, club_id, title, description, location,
  weekday_mask, start_time_local, duration_min,
  start_date, default_fee_cents, currency
) VALUES (
  'series-thu',
  'wwuwh-001',
  'Thursday Session',
  'Weekly training session',
  'TBC',
  8,  -- Thursday (bit 3)
  '20:30',
  90,
  '2024-01-01',
  1000,  -- £10.00 guest/non-member price
  'GBP'
);

-- Sunday Junior session
INSERT INTO event_series (
  id, club_id, title, description, location,
  weekday_mask, start_time_local, duration_min,
  start_date, default_fee_cents, currency
) VALUES (
  'series-sun-junior',
  'wwuwh-001',
  'Sunday Junior Session',
  'Junior training session',
  'TBC',
  64,  -- Sunday (bit 6)
  '10:00',
  90,
  '2024-01-01',
  1000,  -- £10.00 guest price
  'GBP'
);

-- ============================================
-- SAMPLE EVENTS (Next 4 weeks)
-- ============================================

-- Wednesday sessions (20:30 UTC)
INSERT INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  ('evt-wed-2026-01-28', 'wwuwh-001', 'series-wed', 'session',
   'Wednesday Session', 'Weekly training',
   'TBC',
   '2026-01-28T20:30:00Z', '2026-01-28T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-wed-2026-02-04', 'wwuwh-001', 'series-wed', 'session',
   'Wednesday Session', 'Weekly training',
   'TBC',
   '2026-02-04T20:30:00Z', '2026-02-04T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-wed-2026-02-11', 'wwuwh-001', 'series-wed', 'session',
   'Wednesday Session', 'Weekly training',
   'TBC',
   '2026-02-11T20:30:00Z', '2026-02-11T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-wed-2026-02-18', 'wwuwh-001', 'series-wed', 'session',
   'Wednesday Session', 'Weekly training',
   'TBC',
   '2026-02-18T20:30:00Z', '2026-02-18T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP');

-- Thursday sessions (20:30 UTC)
INSERT INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  ('evt-thu-2026-01-29', 'wwuwh-001', 'series-thu', 'session',
   'Thursday Session', 'Weekly training',
   'TBC',
   '2026-01-29T20:30:00Z', '2026-01-29T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-thu-2026-02-05', 'wwuwh-001', 'series-thu', 'session',
   'Thursday Session', 'Weekly training',
   'TBC',
   '2026-02-05T20:30:00Z', '2026-02-05T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-thu-2026-02-12', 'wwuwh-001', 'series-thu', 'session',
   'Thursday Session', 'Weekly training',
   'TBC',
   '2026-02-12T20:30:00Z', '2026-02-12T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-thu-2026-02-19', 'wwuwh-001', 'series-thu', 'session',
   'Thursday Session', 'Weekly training',
   'TBC',
   '2026-02-19T20:30:00Z', '2026-02-19T22:00:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 1000, 'GBP');

-- Sunday Junior sessions (10:00 UTC)
INSERT INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  ('evt-sun-2026-02-01', 'wwuwh-001', 'series-sun-junior', 'session',
   'Sunday Junior Session', 'Junior training',
   'TBC',
   '2026-02-01T10:00:00Z', '2026-02-01T11:30:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-sun-2026-02-08', 'wwuwh-001', 'series-sun-junior', 'session',
   'Sunday Junior Session', 'Junior training',
   'TBC',
   '2026-02-08T10:00:00Z', '2026-02-08T11:30:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-sun-2026-02-15', 'wwuwh-001', 'series-sun-junior', 'session',
   'Sunday Junior Session', 'Junior training',
   'TBC',
   '2026-02-15T10:00:00Z', '2026-02-15T11:30:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 1000, 'GBP'),
  ('evt-sun-2026-02-22', 'wwuwh-001', 'series-sun-junior', 'session',
   'Sunday Junior Session', 'Junior training',
   'TBC',
   '2026-02-22T10:00:00Z', '2026-02-22T11:30:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 1000, 'GBP');
