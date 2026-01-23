-- WWUWH Sample Events for 2026
-- Run with: npx wrangler d1 execute wwuwh-prod --local --persist-to=.wrangler/state --file=db/seed-events-2026.sql

-- Delete old 2025 events
DELETE FROM events WHERE starts_at_utc < '2026-01-01';

-- Monday sessions (21:00-22:30 UTC)
INSERT OR REPLACE INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  -- Week of Jan 27
  ('evt-mon-2026-01-27', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2026-01-27T21:00:00Z', '2026-01-27T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week of Feb 3
  ('evt-mon-2026-02-03', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2026-02-03T21:00:00Z', '2026-02-03T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week of Feb 10
  ('evt-mon-2026-02-10', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2026-02-10T21:00:00Z', '2026-02-10T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week of Feb 17
  ('evt-mon-2026-02-17', 'wwuwh-001', 'series-mon-downham', 'session',
   'Monday Session', 'Weekly training at Downham',
   'Downham Health & Leisure Centre, Moorside Rd, Bromley BR1 5EP',
   '2026-02-17T21:00:00Z', '2026-02-17T22:30:00Z', 'Europe/London',
   20, 'scheduled', 'one_off', 700, 'GBP');

-- Thursday sessions (20:30-22:00 UTC)
INSERT OR REPLACE INTO events (
  id, club_id, series_id, kind, title, description, location,
  starts_at_utc, ends_at_utc, timezone, capacity, status,
  payment_mode, fee_cents, currency
) VALUES
  -- Week of Jan 29
  ('evt-thu-2026-01-29', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2026-01-29T20:30:00Z', '2026-01-29T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week of Feb 5
  ('evt-thu-2026-02-05', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2026-02-05T20:30:00Z', '2026-02-05T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week of Feb 12
  ('evt-thu-2026-02-12', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2026-02-12T20:30:00Z', '2026-02-12T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP'),
  -- Week of Feb 19
  ('evt-thu-2026-02-19', 'wwuwh-001', 'series-thu-caterham', 'session',
   'Thursday Session', 'Weekly training at Caterham',
   'de Stafford School, Burntwood Lane, Caterham CR3 5YX',
   '2026-02-19T20:30:00Z', '2026-02-19T22:00:00Z', 'Europe/London',
   16, 'scheduled', 'one_off', 700, 'GBP');
