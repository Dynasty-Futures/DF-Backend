-- CreateEnum
CREATE TYPE "AffiliateCouponStatus" AS ENUM ('CREATED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "affiliate_applications" ADD COLUMN "referral_code" TEXT;

-- CreateTable
CREATE TABLE "affiliate_coupons" (
    "id" TEXT NOT NULL,
    "platform_coupon_id" TEXT NOT NULL,
    "platform_partner_id" TEXT,
    "creator_id" TEXT,
    "code" TEXT NOT NULL,
    "discount_type" TEXT,
    "discount_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AffiliateCouponStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_coupons_platform_coupon_id_key" ON "affiliate_coupons"("platform_coupon_id");

-- CreateIndex
CREATE INDEX "affiliate_coupons_creator_id_idx" ON "affiliate_coupons"("creator_id");

-- CreateIndex
CREATE INDEX "affiliate_coupons_platform_partner_id_idx" ON "affiliate_coupons"("platform_partner_id");
