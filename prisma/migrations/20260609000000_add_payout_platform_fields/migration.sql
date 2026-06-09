-- AlterEnum
ALTER TYPE "PayoutMethod" ADD VALUE 'RISE';

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "platform_payout_id" TEXT,
ADD COLUMN     "transfer_type" TEXT,
ADD COLUMN     "profit_split" DECIMAL(5,2),
ADD COLUMN     "commission" DECIMAL(12,2),
ADD COLUMN     "transfer_amount" DECIMAL(12,2),
ADD COLUMN     "rejection_reason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payouts_platform_payout_id_key" ON "payouts"("platform_payout_id");
