-- DropForeignKey
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_creator_id_fkey";

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "email" TEXT,
ADD COLUMN     "name" TEXT,
ALTER COLUMN "creator_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "support_tickets_email_idx" ON "support_tickets"("email");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
