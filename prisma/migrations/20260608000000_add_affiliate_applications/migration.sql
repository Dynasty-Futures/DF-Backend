-- CreateEnum
CREATE TYPE "AffiliateApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "affiliate_applications" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT,
    "applicant_email" TEXT,
    "website_url" TEXT,
    "youtube_url" TEXT,
    "x_url" TEXT,
    "instagram_url" TEXT,
    "facebook_url" TEXT,
    "telegram_url" TEXT,
    "discord_url" TEXT,
    "is_funded_trader" BOOLEAN NOT NULL,
    "has_active_dynasty_account" BOOLEAN NOT NULL,
    "promotion_plan" TEXT NOT NULL,
    "primary_traffic_method" TEXT NOT NULL,
    "creates_custom_content" BOOLEAN NOT NULL,
    "content_update_frequency" TEXT NOT NULL,
    "preferred_affiliate_code" TEXT NOT NULL,
    "restricted_jurisdiction_confirmation" BOOLEAN NOT NULL,
    "status" "AffiliateApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "affiliate_applications_creator_id_idx" ON "affiliate_applications"("creator_id");

-- CreateIndex
CREATE INDEX "affiliate_applications_status_idx" ON "affiliate_applications"("status");

-- CreateIndex
CREATE INDEX "affiliate_applications_created_at_idx" ON "affiliate_applications"("created_at");

-- CreateIndex
CREATE INDEX "affiliate_applications_preferred_affiliate_code_idx" ON "affiliate_applications"("preferred_affiliate_code");

-- AddForeignKey
ALTER TABLE "affiliate_applications" ADD CONSTRAINT "affiliate_applications_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
