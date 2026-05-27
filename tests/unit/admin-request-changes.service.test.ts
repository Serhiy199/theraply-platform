import { TherapistApprovalStatus, TherapistReviewNoteType, UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestTherapistReviewChanges,
  AdminOperationsServiceError,
} from "@/server/services/admin-operations.service";

const findAdminMock = vi.hoisted(() => vi.fn());
const findTherapistMock = vi.hoisted(() => vi.fn());
const updateTherapistMock = vi.hoisted(() => vi.fn());
const createReviewNoteMock = vi.hoisted(() => vi.fn());
const createAuditMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const sendChangesRequestedEmailMock = vi.hoisted(() => vi.fn());
const syncApprovedTherapistToWixMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: findAdminMock,
    },
    therapistProfile: {
      findUnique: findTherapistMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/server/services/therapist-onboarding-email.service", () => ({
  sendTherapistOnboardingApprovedEmail: vi.fn(),
  sendTherapistOnboardingChangesRequestedEmail: sendChangesRequestedEmailMock,
  sendTherapistOnboardingRejectedEmail: vi.fn(),
}));

vi.mock("@/server/services/wix-therapist-sync.service", () => ({
  syncApprovedTherapistToWix: syncApprovedTherapistToWixMock,
}));

vi.mock("@/server/services/google-calendar.service", () => ({
  deleteTherapistGoogleCalendarEvent: vi.fn(),
  GoogleCalendarServiceError: class GoogleCalendarServiceError extends Error {},
}));

vi.mock("@/server/services/refund.service", () => ({
  refundPlatformCancellationIfEligible: vi.fn(),
  RefundServiceError: class RefundServiceError extends Error {},
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendBookingCancelledEmailsBestEffort: vi.fn(),
}));

function buildReview(approvalStatus: TherapistApprovalStatus) {
  return {
    id: "therapist-profile-id",
    userId: "therapist-user-id",
    displayName: "Pending Therapist",
    approvalStatus,
    isApproved: false,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    user: {
      id: "therapist-user-id",
      email: "therapist@example.com",
      firstName: "Pending",
      lastName: "Therapist",
    },
    certificates: [],
  };
}

beforeEach(() => {
  findAdminMock.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
    role: UserRole.ADMIN,
  });
  findTherapistMock.mockResolvedValue(buildReview(TherapistApprovalStatus.PENDING_REVIEW));
  updateTherapistMock.mockResolvedValue(buildReview(TherapistApprovalStatus.CHANGES_REQUESTED));
  createReviewNoteMock.mockResolvedValue({});
  createAuditMock.mockResolvedValue({});
  transactionMock.mockImplementation(async (callback) =>
    callback({
      therapistProfile: {
        update: updateTherapistMock,
      },
      therapistReviewNote: {
        create: createReviewNoteMock,
      },
      auditLog: {
        create: createAuditMock,
      },
    }),
  );
  sendChangesRequestedEmailMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("requestTherapistReviewChanges", () => {
  it("stores feedback and changes status without syncing to Wix", async () => {
    const result = await requestTherapistReviewChanges(
      "admin-id",
      "therapist-profile-id",
      "  Please upload a clearer certificate photo.  ",
    );

    expect(result.approvalStatus).toBe(TherapistApprovalStatus.CHANGES_REQUESTED);
    expect(updateTherapistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
          isApproved: false,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      }),
    );
    expect(createReviewNoteMock).toHaveBeenCalledWith({
      data: {
        therapistProfileId: "therapist-profile-id",
        adminId: "admin-id",
        type: TherapistReviewNoteType.CHANGES_REQUESTED,
        message: "Please upload a clearer certificate photo.",
      },
    });
    expect(createAuditMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-id",
        entityId: "therapist-profile-id",
        action: "ADMIN_REQUEST_THERAPIST_CHANGES",
      }),
    });
    expect(sendChangesRequestedEmailMock).toHaveBeenCalledWith({
      userId: "therapist-user-id",
      email: "therapist@example.com",
      firstName: "Pending",
      displayName: "Pending Therapist",
      changesRequestedMessage: "Please upload a clearer certificate photo.",
    });
    expect(syncApprovedTherapistToWixMock).not.toHaveBeenCalled();
  });

  it("rejects an empty changes request before mutating the review", async () => {
    await expect(
      requestTherapistReviewChanges("admin-id", "therapist-profile-id", "   "),
    ).rejects.toMatchObject({
      code: "THERAPIST_REVIEW_MESSAGE_REQUIRED",
    } satisfies Partial<AdminOperationsServiceError>);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(sendChangesRequestedEmailMock).not.toHaveBeenCalled();
  });

  it("requires a useful changes request message before mutating the review", async () => {
    await expect(
      requestTherapistReviewChanges("admin-id", "therapist-profile-id", "Too short"),
    ).rejects.toMatchObject({
      code: "THERAPIST_REVIEW_MESSAGE_INVALID",
    } satisfies Partial<AdminOperationsServiceError>);

    expect(transactionMock).not.toHaveBeenCalled();
    expect(sendChangesRequestedEmailMock).not.toHaveBeenCalled();
  });
});
