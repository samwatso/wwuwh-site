-- Migration 007: External Events Tables
-- Stores events from external sources (UK UWH calendar) for club admins to review/promote

-- External events from UK calendar feed
CREATE TABLE external_events (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL DEFAULT 'uk_uwh',  -- Source identifier
  source_event_id TEXT NOT NULL,                    -- ID from the source (e.g., UK calendar event ID)
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  starts_at_utc   TEXT NOT NULL,
  ends_at_utc     TEXT,
  raw_data_json   TEXT,                             -- Original data from source
  fetched_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source, source_event_id)
);

-- Links external events to club decisions (promote/ignore)
CREATE TABLE external_event_links (
  external_event_id TEXT NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
  club_id           TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  decision          TEXT NOT NULL CHECK(decision IN ('promoted','ignored')),
  linked_event_id   TEXT REFERENCES events(id) ON DELETE SET NULL,  -- The club event created from promotion
  decided_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  decided_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (external_event_id, club_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_external_events_source_starts ON external_events(source, starts_at_utc);
CREATE INDEX idx_external_event_links_club ON external_event_links(club_id, decision);
