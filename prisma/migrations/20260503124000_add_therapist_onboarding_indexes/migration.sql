-- CreateIndex
CREATE INDEX "TherapistProfile_onboardingCompleted_idx" ON "public"."TherapistProfile"("onboardingCompleted");

-- CreateIndex
CREATE INDEX "TherapistProfile_submittedForReviewAt_idx" ON "public"."TherapistProfile"("submittedForReviewAt");

-- CreateIndex
CREATE INDEX "TherapistProfile_approvalStatus_onboardingCompleted_idx" ON "public"."TherapistProfile"("approvalStatus", "onboardingCompleted");

-- CreateIndex
CREATE INDEX "TherapistProfile_approvalStatus_submittedForReviewAt_idx" ON "public"."TherapistProfile"("approvalStatus", "submittedForReviewAt");
