-- Add existing user to the default club
INSERT OR IGNORE INTO club_memberships (id, club_id, person_id, member_type, status, joined_at)
VALUES ('mem-manual-001', 'wwuwh-001', '4a3628e3-9511-4c42-b52c-27c63da9e0c2', 'member', 'active', datetime('now'));

-- Also add the default member role
INSERT OR IGNORE INTO club_member_roles (club_id, person_id, role_key, created_at)
VALUES ('wwuwh-001', '4a3628e3-9511-4c42-b52c-27c63da9e0c2', 'member', datetime('now'));
