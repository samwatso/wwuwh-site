-- Add a subscription for testing
-- Choose ONE of these options by uncommenting the relevant INSERT

-- Your person ID
-- 4a3628e3-9511-4c42-b52c-27c63da9e0c2

-- ============================================
-- OPTION 1: Multi Swim Adult (£48/month, 2 sessions - Wed + Thu)
-- ============================================
INSERT OR REPLACE INTO member_subscriptions (
  id, club_id, person_id, plan_id, status, start_at, created_at
) VALUES (
  'sub-test-001',
  'wwuwh-001',
  '4a3628e3-9511-4c42-b52c-27c63da9e0c2',
  'plan-multi-adult',
  'active',
  datetime('now'),
  datetime('now')
);

-- ============================================
-- OPTION 2: Single Swim Adult (£31/month, 1 session - Wed or Thu)
-- Uncomment below and comment out OPTION 1
-- ============================================
-- INSERT OR REPLACE INTO member_subscriptions (
--   id, club_id, person_id, plan_id, status, start_at, created_at
-- ) VALUES (
--   'sub-test-001',
--   'wwuwh-001',
--   '4a3628e3-9511-4c42-b52c-27c63da9e0c2',
--   'plan-single-adult',
--   'active',
--   datetime('now'),
--   datetime('now')
-- );

-- ============================================
-- To switch plans, run one of these:
-- ============================================
-- Multi Adult:   UPDATE member_subscriptions SET plan_id = 'plan-multi-adult' WHERE id = 'sub-test-001';
-- Multi Student: UPDATE member_subscriptions SET plan_id = 'plan-multi-student' WHERE id = 'sub-test-001';
-- Single Adult:  UPDATE member_subscriptions SET plan_id = 'plan-single-adult' WHERE id = 'sub-test-001';
-- Single Student: UPDATE member_subscriptions SET plan_id = 'plan-single-student' WHERE id = 'sub-test-001';
-- Junior:        UPDATE member_subscriptions SET plan_id = 'plan-junior' WHERE id = 'sub-test-001';

-- ============================================
-- To remove subscription (test as guest/pay-per-session):
-- ============================================
-- DELETE FROM member_subscriptions WHERE id = 'sub-test-001';
