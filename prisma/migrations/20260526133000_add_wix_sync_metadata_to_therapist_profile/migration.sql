-- CreateEnum
CREATE TYPE "public"."WixSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."TherapistProfile"
ADD COLUMN "wixSubmissionId" TEXT,
ADD COLUMN "wixSyncStatus" "public"."WixSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN "wixSyncedAt" TIMESTAMP(3),
ADD COLUMN "wixSyncError" TEXT;

-- CreateIndex
CREATE INDEX "TherapistProfile_wixSyncStatus_idx" ON "public"."TherapistProfile"("wixSyncStatus");

-- CreateIndex
CREATE INDEX "TherapistProfile_wixSyncedAt_idx" ON "public"."TherapistProfile"("wixSyncedAt");
