-- AlterEnum
ALTER TYPE "public"."TherapistApprovalStatus" ADD VALUE 'CHANGES_REQUESTED';

-- CreateEnum
CREATE TYPE "public"."TherapistReviewNoteType" AS ENUM ('CHANGES_REQUESTED', 'REJECTED', 'INTERNAL_NOTE');

-- CreateTable
CREATE TABLE "public"."TherapistReviewNote" (
    "id" TEXT NOT NULL,
    "therapistProfileId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "public"."TherapistReviewNoteType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TherapistReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TherapistReviewNote_therapistProfileId_createdAt_idx" ON "public"."TherapistReviewNote"("therapistProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "TherapistReviewNote_adminId_idx" ON "public"."TherapistReviewNote"("adminId");

-- CreateIndex
CREATE INDEX "TherapistReviewNote_type_idx" ON "public"."TherapistReviewNote"("type");

-- AddForeignKey
ALTER TABLE "public"."TherapistReviewNote" ADD CONSTRAINT "TherapistReviewNote_therapistProfileId_fkey" FOREIGN KEY ("therapistProfileId") REFERENCES "public"."TherapistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TherapistReviewNote" ADD CONSTRAINT "TherapistReviewNote_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
