-- Make password_hash nullable so OAuth-only users can request a password reset
-- ("set your password" flow) without first having a credentials row.
ALTER TABLE "user_credentials" ALTER COLUMN "password_hash" DROP NOT NULL;
