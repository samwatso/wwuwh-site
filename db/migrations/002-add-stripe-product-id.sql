-- Migration: Add stripe_product_id to billing_plans
-- Run with: npx wrangler d1 execute wwuwh-prod --local --persist-to=.wrangler/state --file=db/migrations/002-add-stripe-product-id.sql

ALTER TABLE billing_plans ADD COLUMN stripe_product_id TEXT;

-- Index for faster Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_member_subscriptions_stripe_customer ON member_subscriptions(stripe_customer_id);
