-- DropIndex
DROP INDEX "accounts_your_prop_firm_id_idx";

-- DropIndex
DROP INDEX "accounts_your_prop_firm_id_key";

-- AlterTable
ALTER TABLE "account_types" ADD COLUMN     "ypf_program_id" TEXT;

-- AlterTable
ALTER TABLE "accounts" DROP COLUMN "your_prop_firm_id",
ADD COLUMN     "platform_account_id" TEXT,
ADD COLUMN     "platform_user_id" TEXT,
ADD COLUMN     "volumetrica_user_id" TEXT;

-- AlterTable
ALTER TABLE "challenge_rules" DROP COLUMN "platform_rule_id";

-- CreateIndex
CREATE UNIQUE INDEX "account_types_ypf_program_id_key" ON "account_types"("ypf_program_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_platform_account_id_key" ON "accounts"("platform_account_id");

-- CreateIndex
CREATE INDEX "accounts_platform_account_id_idx" ON "accounts"("platform_account_id");

-- CreateIndex
CREATE INDEX "accounts_platform_user_id_idx" ON "accounts"("platform_user_id");
