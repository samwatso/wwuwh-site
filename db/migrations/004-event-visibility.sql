-- Migration 004: Add event visibility control
-- Events become visible to members X days before they occur

-- Add visibility_from to events (when event becomes visible to members)
ALTER TABLE events ADD COLUMN visible_from TEXT;

-- Add visibility_days to event_series (how many days before event becomes visible)
ALTER TABLE event_series ADD COLUMN visibility_days INTEGER DEFAULT 5;

-- Index for efficient visibility queries
CREATE INDEX IF NOT EXISTS idx_events_visible_from ON events(club_id, visible_from, starts_at_utc);

-- Update existing events to have visible_from = starts_at_utc - 5 days (default)
UPDATE events
SET visible_from = datetime(starts_at_utc, '-5 days')
WHERE visible_from IS NULL;
