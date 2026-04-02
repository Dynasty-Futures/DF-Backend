-- AlterTable
ALTER TABLE "users" ADD COLUMN "platform_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_platform_user_id_key" ON "users"("platform_user_id");
