-- Migration: 005-event-invitations.sql
-- Add event and series invitations for invite-only events

-- Event invitations (for individual events)
CREATE TABLE IF NOT EXISTS event_invitations (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id     TEXT REFERENCES people(id) ON DELETE CASCADE,
  group_id      TEXT REFERENCES groups(id) ON DELETE CASCADE,
  invited_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- Exactly one of person_id or group_id must be set
  CHECK ((person_id IS NOT NULL AND group_id IS NULL) OR (person_id IS NULL AND group_id IS NOT NULL))
);

-- Each person can only be directly invited once per event
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_invitations_person ON event_invitations(event_id, person_id) WHERE person_id IS NOT NULL;
-- Each group can only be invited once per event
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_invitations_group ON event_invitations(event_id, group_id) WHERE group_id IS NOT NULL;
-- Fast lookups for event filtering
CREATE INDEX IF NOT EXISTS idx_event_invitations_event ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_person ON event_invitations(person_id) WHERE person_id IS NOT NULL;

-- Series invitations (auto-copied to generated events)
CREATE TABLE IF NOT EXISTS series_invitations (
  id            TEXT PRIMARY KEY,
  series_id     TEXT NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  person_id     TEXT REFERENCES people(id) ON DELETE CASCADE,
  group_id      TEXT REFERENCES groups(id) ON DELETE CASCADE,
  invited_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- Exactly one of person_id or group_id must be set
  CHECK ((person_id IS NOT NULL AND group_id IS NULL) OR (person_id IS NULL AND group_id IS NOT NULL))
);

-- Each person can only be directly invited once per series
CREATE UNIQUE INDEX IF NOT EXISTS uq_series_invitations_person ON series_invitations(series_id, person_id) WHERE person_id IS NOT NULL;
-- Each group can only be invited once per series
CREATE UNIQUE INDEX IF NOT EXISTS uq_series_invitations_group ON series_invitations(series_id, group_id) WHERE group_id IS NOT NULL;
-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_series_invitations_series ON series_invitations(series_id);
