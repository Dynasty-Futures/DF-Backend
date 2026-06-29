-- Add the UPGRADED account status. An account that passes evaluation is retired
-- on YPF (a new funded account is spawned and this one is marked `Upgraded`);
-- we mirror that locally so it shows under "Inactive Accounts" rather than being
-- mislabelled funded/closed. Additive enum value — non-destructive.
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'UPGRADED';
