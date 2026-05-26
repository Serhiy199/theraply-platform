import { TherapistApprovalStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  canEditTherapistOnboardingDraft,
  isTherapistOnboardingDraftLocked,
  therapistDraftEditableStatuses,
  therapistDraftLockedStatuses,
} from "@/lib/therapist-lifecycle";

describe("therapist onboarding lifecycle editing rules", () => {
  it("allows drafting and resubmission only for incomplete or changes-requested profiles", () => {
    expect(therapistDraftEditableStatuses).toEqual([
      TherapistApprovalStatus.PROFILE_INCOMPLETE,
      TherapistApprovalStatus.CHANGES_REQUESTED,
    ]);
    expect(canEditTherapistOnboardingDraft(TherapistApprovalStatus.PROFILE_INCOMPLETE)).toBe(true);
    expect(canEditTherapistOnboardingDraft(TherapistApprovalStatus.CHANGES_REQUESTED)).toBe(true);
  });

  it("keeps rejected profiles final and locks all non-editable workflow states", () => {
    expect(therapistDraftLockedStatuses).toContain(TherapistApprovalStatus.REJECTED);
    expect(canEditTherapistOnboardingDraft(TherapistApprovalStatus.REJECTED)).toBe(false);
    expect(isTherapistOnboardingDraftLocked(TherapistApprovalStatus.REJECTED)).toBe(true);
    expect(isTherapistOnboardingDraftLocked(TherapistApprovalStatus.PENDING_REVIEW)).toBe(true);
    expect(isTherapistOnboardingDraftLocked(TherapistApprovalStatus.APPROVED)).toBe(true);
  });
});
