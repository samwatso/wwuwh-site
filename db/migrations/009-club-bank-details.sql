-- Add bank account details to clubs table for BACS payments
-- These fields are optional and only needed if the club wants to accept BACS payments

ALTER TABLE clubs ADD COLUMN bank_account_name TEXT;
ALTER TABLE clubs ADD COLUMN bank_sort_code TEXT;
ALTER TABLE clubs ADD COLUMN bank_account_number TEXT;
