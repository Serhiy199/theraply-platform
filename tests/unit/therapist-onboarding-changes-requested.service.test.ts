import { TherapistApprovalStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { saveTherapistOnboardingDraft } from "@/server/services/therapist-onboarding.service";

const findUniqueMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const createAuditLogEntryBestEffortMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: createAuditLogEntryBestEffortMock,
}));

vi.mock("@/server/services/therapist-onboarding-email.service", () => ({
  sendTherapistOnboardingPendingReviewEmail: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("saveTherapistOnboardingDraft after a changes request", () => {
  it("keeps the profile in changes requested while the therapist edits a draft", async () => {
    findUniqueMock.mockResolvedValue({
      id: "therapist-profile-id",
      userId: "therapist-user-id",
      approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
      user: {
        email: "therapist@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    });
    updateMock.mockResolvedValue({
      id: "therapist-profile-id",
      userId: "therapist-user-id",
      approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
      profileDraft: {},
    });

    const result = await saveTherapistOnboardingDraft("therapist-user-id", {
      gender: "Female",
      contactNumber: "+44 7000 000000",
      therapyServicesProvided: "Personal therapy",
      yearsOfExperience: "5",
      educationAndCertifications: "Updated certificate details",
      specialisation: "Anxiety",
      pricePerHour: "50",
    });

    expect(result.approvalStatus).toBe(TherapistApprovalStatus.CHANGES_REQUESTED);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
        }),
      }),
    );
    expect(createAuditLogEntryBestEffortMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "THERAPIST_ONBOARDING_DRAFT_SAVED",
        before: {
          approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
        },
        after: expect.objectContaining({
          approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
        }),
      }),
    );
  });
});
