-- Migration: Add event_teams and event_team_assignments tables
-- Run with: npx wrangler d1 execute wwuwh-prod --local --persist-to=.wrangler/state --file=db/migrations/003-add-team-assignments.sql

-- Teams for each event (typically White/Black, but can be more)
CREATE TABLE IF NOT EXISTS event_teams (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(event_id, name)
);

CREATE INDEX IF NOT EXISTS idx_event_teams_event ON event_teams(event_id);

-- Team assignments for players
CREATE TABLE IF NOT EXISTS event_team_assignments (
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  team_id     TEXT REFERENCES event_teams(id) ON DELETE SET NULL,
  activity    TEXT NOT NULL DEFAULT 'play' CHECK(activity IN ('play','swim_sets','not_playing','other')),
  position_code TEXT CHECK(position_code IN ('F','W','C','B')),
  notes       TEXT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  assigned_by_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_eta_event_team ON event_team_assignments(event_id, team_id);
CREATE INDEX IF NOT EXISTS idx_eta_person ON event_team_assignments(person_id);
CREATE INDEX IF NOT EXISTS idx_eta_event_activity ON event_team_assignments(event_id, activity);
