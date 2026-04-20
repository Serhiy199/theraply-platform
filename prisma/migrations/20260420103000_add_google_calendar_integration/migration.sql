-- AlterTable
ALTER TABLE "public"."TherapistProfile"
ADD COLUMN "googleAccessToken" TEXT,
ADD COLUMN "googleRefreshToken" TEXT,
ADD COLUMN "googleTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "googleCalendarConnectedAt" TIMESTAMP(3),
ADD COLUMN "isGoogleCalendarConnected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Session"
ADD COLUMN "googleCalendarEventId" TEXT,
ADD COLUMN "googleCalendarConferenceId" TEXT,
ADD COLUMN "googleCalendarEventHtmlLink" TEXT;

-- CreateIndex
CREATE INDEX "TherapistProfile_isGoogleCalendarConnected_idx" ON "public"."TherapistProfile"("isGoogleCalendarConnected");

-- CreateIndex
CREATE INDEX "TherapistProfile_googleTokenExpiresAt_idx" ON "public"."TherapistProfile"("googleTokenExpiresAt");

-- CreateIndex
CREATE INDEX "TherapistProfile_isApproved_isGoogleCalendarConnected_idx" ON "public"."TherapistProfile"("isApproved", "isGoogleCalendarConnected");

-- CreateIndex
CREATE UNIQUE INDEX "Session_googleCalendarEventId_key" ON "public"."Session"("googleCalendarEventId");

-- CreateIndex
CREATE INDEX "Session_googleCalendarConferenceId_idx" ON "public"."Session"("googleCalendarConferenceId");
