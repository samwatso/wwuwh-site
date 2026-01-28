-- Add pricing categories for tiered event pricing
--
-- This migration adds:
-- 1. pricing_category column to people table (default: 'adult')
-- 2. event_pricing_tiers table for per-event category pricing
-- 3. charged_category column to transactions table

-- Add pricing_category to people (default to 'adult')
ALTER TABLE people ADD COLUMN pricing_category TEXT NOT NULL DEFAULT 'adult'
  CHECK(pricing_category IN ('adult', 'student', 'junior', 'senior', 'guest'));

-- Create event_pricing_tiers table
CREATE TABLE IF NOT EXISTS event_pricing_tiers (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK(category IN ('adult', 'student', 'junior', 'senior', 'guest')),
  price_cents   INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'GBP',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(event_id, category)
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_event_pricing_tiers_event ON event_pricing_tiers(event_id);

-- Add charged_category to transactions to track which category was used for pricing
ALTER TABLE transactions ADD COLUMN charged_category TEXT
  CHECK(charged_category IS NULL OR charged_category IN ('adult', 'student', 'junior', 'senior', 'guest'));
