-- DF plan-level maximum payout per eligible payout cycle (null = not capped).
ALTER TABLE "account_types" ADD COLUMN "payout_cycle_cap" DECIMAL(10,2);
