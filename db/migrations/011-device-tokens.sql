-- Migration: 011-device-tokens.sql
-- Add device tokens table for push notifications

CREATE TABLE IF NOT EXISTS device_tokens (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Each device token should only be registered once per person
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_tokens_person_token ON device_tokens(person_id, token);
-- Fast lookups by token (for cleanup/updates)
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
-- Fast lookups by person (for sending notifications)
CREATE INDEX IF NOT EXISTS idx_device_tokens_person ON device_tokens(person_id);
