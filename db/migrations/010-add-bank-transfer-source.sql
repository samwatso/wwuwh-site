-- Add 'bank_transfer' as valid source type for transactions
-- SQLite requires recreating the table to modify CHECK constraints

-- Step 1: Create new table with updated constraint
CREATE TABLE transactions_new (
  id                TEXT PRIMARY KEY,
  club_id           TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  person_id         TEXT REFERENCES people(id) ON DELETE SET NULL,
  event_id          TEXT REFERENCES events(id) ON DELETE SET NULL,
  payment_request_id TEXT REFERENCES payment_requests(id) ON DELETE SET NULL,
  source            TEXT NOT NULL CHECK(source IN ('stripe','cash','bank_transfer','manual')),
  type              TEXT NOT NULL CHECK(type IN ('charge','refund','adjustment')),
  amount_cents      INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'GBP',
  status            TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','cancelled')),
  stripe_payment_intent_id TEXT,
  stripe_charge_id         TEXT,
  stripe_refund_id         TEXT,
  reference                TEXT,
  notes                    TEXT,
  collected_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  effective_at      TEXT
);

-- Step 2: Copy data from old table
INSERT INTO transactions_new
SELECT id, club_id, person_id, event_id, payment_request_id, source, type,
       amount_cents, currency, status, stripe_payment_intent_id, stripe_charge_id,
       stripe_refund_id, reference, notes, collected_by_person_id, created_at, effective_at
FROM transactions;

-- Step 3: Drop old table
DROP TABLE transactions;

-- Step 4: Rename new table
ALTER TABLE transactions_new RENAME TO transactions;

-- Step 5: Recreate indexes if any existed
CREATE INDEX IF NOT EXISTS idx_transactions_club_id ON transactions(club_id);
CREATE INDEX IF NOT EXISTS idx_transactions_person_id ON transactions(person_id);
CREATE INDEX IF NOT EXISTS idx_transactions_event_id ON transactions(event_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
