-- Allow unlimited sessions for lifetime membership plans
-- Use -1 to represent unlimited sessions

-- SQLite doesn't support ALTER CONSTRAINT, so we need to:
-- 1. Create a new table with updated constraint
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

-- Create new table with updated constraint
CREATE TABLE billing_plans_new (
  id              TEXT PRIMARY KEY,
  club_id         TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  cadence         TEXT NOT NULL DEFAULT 'month' CHECK(cadence IN ('month')),
  weekly_sessions_allowed INTEGER NOT NULL CHECK(weekly_sessions_allowed IN (-1, 1, 2)),
  price_cents     INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'GBP',
  stripe_price_id TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  stripe_product_id TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

-- Copy existing data
INSERT INTO billing_plans_new SELECT * FROM billing_plans;

-- Drop old table
DROP TABLE billing_plans;

-- Rename new table
ALTER TABLE billing_plans_new RENAME TO billing_plans;

-- Recreate index
CREATE INDEX idx_billing_plans_club_active ON billing_plans(club_id, active);
