-- Optional profile/address fields, trader-editable on the dashboard profile.
ALTER TABLE "users" ADD COLUMN "date_of_birth" TEXT;
ALTER TABLE "users" ADD COLUMN "address" TEXT;
ALTER TABLE "users" ADD COLUMN "city" TEXT;
ALTER TABLE "users" ADD COLUMN "state" TEXT;
ALTER TABLE "users" ADD COLUMN "postal_code" TEXT;
ALTER TABLE "users" ADD COLUMN "country" TEXT;
ALTER TABLE "users" ADD COLUMN "timezone" TEXT;
