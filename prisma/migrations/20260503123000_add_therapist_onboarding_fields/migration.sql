-- AlterTable
ALTER TABLE "public"."TherapistProfile"
ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "submittedForReviewAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "profileDraft" JSONB;
