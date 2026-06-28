-- Affiliate Platform linkage on affiliate applications
ALTER TABLE "affiliate_applications"
  ADD COLUMN "platform_partner_id" TEXT,
  ADD COLUMN "platform_status" TEXT;
