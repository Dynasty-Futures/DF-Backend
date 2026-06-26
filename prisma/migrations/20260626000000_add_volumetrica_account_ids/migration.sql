-- Add Volumetrica account identifiers (sourced from YPF account extraValues)
-- used to build the embedded trading-platform (webapp) URL.
ALTER TABLE "accounts" ADD COLUMN "volumetrica_account_id" TEXT;
ALTER TABLE "accounts" ADD COLUMN "volumetrica_account_number" TEXT;
