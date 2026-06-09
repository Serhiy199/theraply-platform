CREATE TYPE "public"."SessionOutcome" AS ENUM ('COMPLETED', 'CLIENT_NO_SHOW');

CREATE TYPE "public"."PaymentTransferStatus" AS ENUM ('NOT_ELIGIBLE', 'PENDING', 'TRANSFERRED', 'FAILED');

CREATE TYPE "public"."StripeConnectOnboardingStatus" AS ENUM ('NOT_STARTED', 'ACCOUNT_CREATED', 'ONBOARDING_STARTED', 'RESTRICTED', 'READY', 'DISABLED');

ALTER TABLE "public"."TherapistProfile"
ADD COLUMN "stripeAccountId" TEXT,
ADD COLUMN "stripeOnboardingStatus" "public"."StripeConnectOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeOnboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "stripeAccountSyncedAt" TIMESTAMP(3),
ADD COLUMN "stripeRequirementsDue" JSONB,
ADD COLUMN "stripeDisabledReason" TEXT;

ALTER TABLE "public"."Session"
ADD COLUMN "outcome" "public"."SessionOutcome";

ALTER TABLE "public"."Payment"
ADD COLUMN "stripeChargeId" TEXT,
ADD COLUMN "stripeTransferGroup" TEXT,
ADD COLUMN "stripeTransferId" TEXT,
ADD COLUMN "platformFeeAmount" INTEGER,
ADD COLUMN "therapistAmount" INTEGER,
ADD COLUMN "transferStatus" "public"."PaymentTransferStatus" NOT NULL DEFAULT 'NOT_ELIGIBLE',
ADD COLUMN "transferredAt" TIMESTAMP(3),
ADD COLUMN "transferFailedAt" TIMESTAMP(3),
ADD COLUMN "transferFailureReason" TEXT,
ADD COLUMN "transferAttemptCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "public"."StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TherapistProfile_stripeAccountId_key" ON "public"."TherapistProfile"("stripeAccountId");
CREATE INDEX "TherapistProfile_stripeOnboardingStatus_idx" ON "public"."TherapistProfile"("stripeOnboardingStatus");
CREATE INDEX "TherapistProfile_stripeChargesEnabled_stripePayoutsEnabled_idx" ON "public"."TherapistProfile"("stripeChargesEnabled", "stripePayoutsEnabled");

CREATE INDEX "Session_outcome_idx" ON "public"."Session"("outcome");

CREATE UNIQUE INDEX "Payment_stripeChargeId_key" ON "public"."Payment"("stripeChargeId");
CREATE UNIQUE INDEX "Payment_stripeTransferGroup_key" ON "public"."Payment"("stripeTransferGroup");
CREATE UNIQUE INDEX "Payment_stripeTransferId_key" ON "public"."Payment"("stripeTransferId");
CREATE INDEX "Payment_transferStatus_idx" ON "public"."Payment"("transferStatus");
CREATE INDEX "Payment_transferredAt_idx" ON "public"."Payment"("transferredAt");
CREATE INDEX "Payment_transferFailedAt_idx" ON "public"."Payment"("transferFailedAt");
CREATE INDEX "Payment_transferStatus_createdAt_idx" ON "public"."Payment"("transferStatus", "createdAt");

CREATE INDEX "StripeWebhookEvent_eventType_idx" ON "public"."StripeWebhookEvent"("eventType");
CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "public"."StripeWebhookEvent"("processedAt");
