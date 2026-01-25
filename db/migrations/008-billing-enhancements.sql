-- Migration 008: Billing Enhancements
-- Adds bank statement import tables, transaction fields, and manual subscription tracking

-- Add notes and reference fields to transactions table
ALTER TABLE transactions ADD COLUMN notes TEXT;
ALTER TABLE transactions ADD COLUMN reference TEXT;

-- Add is_manual flag and notes to member_subscriptions
-- is_manual = 1 means "trusted manual subscription" (not yet confirmed paid via bank statement match)
ALTER TABLE member_subscriptions ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member_subscriptions ADD COLUMN manual_notes TEXT;

-- Bank statement imports tracking
CREATE TABLE bank_statement_imports (
  id                    TEXT PRIMARY KEY,
  club_id               TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  source                TEXT NOT NULL DEFAULT 'barclays_csv',
  account_mask          TEXT,
  filename              TEXT,
  uploaded_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  uploaded_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status                TEXT NOT NULL DEFAULT 'processed' CHECK(status IN ('processed','failed')),
  row_count             INTEGER NOT NULL DEFAULT 0
);

-- Individual rows from bank statements
CREATE TABLE bank_statement_rows (
  id            TEXT PRIMARY KEY,
  import_id     TEXT NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  txn_number    TEXT,
  txn_date      TEXT NOT NULL,
  account       TEXT,
  amount_cents  INTEGER NOT NULL,
  subcategory   TEXT,
  memo          TEXT,
  direction     TEXT NOT NULL CHECK(direction IN ('in','out')),
  fingerprint   TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Matches between bank rows and transactions
CREATE TABLE transaction_matches (
  id                    TEXT PRIMARY KEY,
  club_id               TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  bank_row_id           TEXT NOT NULL REFERENCES bank_statement_rows(id) ON DELETE CASCADE,
  transaction_id        TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  match_type            TEXT NOT NULL CHECK(match_type IN ('auto','manual')),
  confidence            REAL,
  created_by_person_id  TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(bank_row_id),
  UNIQUE(transaction_id)
);

-- Indexes for bank statement queries
CREATE INDEX idx_bank_statement_imports_club ON bank_statement_imports(club_id, uploaded_at);
CREATE INDEX idx_bank_statement_rows_import ON bank_statement_rows(import_id);
CREATE INDEX idx_bank_statement_rows_date ON bank_statement_rows(txn_date);
CREATE INDEX idx_bank_statement_rows_direction ON bank_statement_rows(direction);
CREATE INDEX idx_transaction_matches_club ON transaction_matches(club_id);
CREATE INDEX idx_transaction_matches_bank_row ON transaction_matches(bank_row_id);
CREATE INDEX idx_transaction_matches_transaction ON transaction_matches(transaction_id);

-- Index for transactions effective_at for billing queries
CREATE INDEX idx_transactions_club_effective ON transactions(club_id, effective_at);

-- Index for subscriptions is_manual flag
CREATE INDEX idx_member_subscriptions_is_manual ON member_subscriptions(club_id, is_manual);
