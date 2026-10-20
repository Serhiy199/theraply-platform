import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { approveTherapistReview } from "@/server/services/admin-operations.service";
import { assertWixProfileNotIsolated } from "@/lib/wix/wix-staging-isolation";
import { enableWixStagingIsolation } from "../helpers/wix-staging-isolation";

const findAdminMock = vi.hoisted(() => vi.fn());
const findTherapistMock = vi.hoisted(() => vi.fn());
const updateTherapistMock = vi.hoisted(() => vi.fn());
const createAuditMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const sendApprovedEmailMock = vi.hoisted(() => vi.fn());
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
  sendTherapistOnboardingApprovedEmail: sendApprovedEmailMock,
  sendTherapistOnboardingChangesRequestedEmail: vi.fn(),
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
    displayName: "Approved Therapist",
    approvalStatus,
    isApproved: approvalStatus === TherapistApprovalStatus.APPROVED,
    approvedAt: approvalStatus === TherapistApprovalStatus.APPROVED ? new Date() : null,
    rejectedAt: null,
    rejectionReason: null,
    user: {
      id: "therapist-user-id",
      email: "therapist@example.com",
      firstName: "Approved",
      lastName: "Therapist",
    },
    certificates: [],
  };
}

beforeEach(() => {
  syncApprovedTherapistToWixMock.mockReset();
  findAdminMock.mockResolvedValue({
    id: "admin-id",
    email: "admin@example.com",
    role: UserRole.ADMIN,
  });
  findTherapistMock.mockResolvedValue(buildReview(TherapistApprovalStatus.PENDING_REVIEW));
  updateTherapistMock.mockResolvedValue(buildReview(TherapistApprovalStatus.APPROVED));
  createAuditMock.mockResolvedValue({});
  transactionMock.mockImplementation(async (callback) =>
    callback({
      therapistProfile: {
        update: updateTherapistMock,
      },
      auditLog: {
        create: createAuditMock,
      },
    }),
  );
  sendApprovedEmailMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("approveTherapistReview Wix integration", () => {
  it("preserves target-only approval, audit and notification while explicitly reporting suppression", async () => {
    enableWixStagingIsolation("therapist-profile-id");
    syncApprovedTherapistToWixMock.mockImplementation(async (id) => assertWixProfileNotIsolated(id));
    const result = await approveTherapistReview("admin-id", "therapist-profile-id");
    expect(result.wixSync.status).toBe("suppressed");
    expect(result.therapistProfile.approvalStatus).toBe(TherapistApprovalStatus.APPROVED);
    expect(updateTherapistMock).toHaveBeenCalledTimes(1);
    expect(updateTherapistMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "therapist-profile-id" } }));
    expect(createAuditMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "ADMIN_APPROVE_THERAPIST", actorUserId: "admin-id", entityId: "therapist-profile-id" }) }));
    expect(sendApprovedEmailMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an unauthorized actor without DB changes, notification or Wix sync", async () => {
    findAdminMock.mockResolvedValue(null);
    await expect(approveTherapistReview("unauthorized", "therapist-profile-id")).rejects.toThrow();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateTherapistMock).not.toHaveBeenCalled();
    expect(createAuditMock).not.toHaveBeenCalled();
    expect(sendApprovedEmailMock).not.toHaveBeenCalled();
    expect(syncApprovedTherapistToWixMock).not.toHaveBeenCalled();
  });

  it("rejects repeated approval without duplicate approval, audit, email or sync", async () => {
    syncApprovedTherapistToWixMock.mockResolvedValue({ success: true });
    await approveTherapistReview("admin-id", "therapist-profile-id");
    findTherapistMock.mockResolvedValue(buildReview(TherapistApprovalStatus.APPROVED));
    await expect(approveTherapistReview("admin-id", "therapist-profile-id")).rejects.toMatchObject({ code: "THERAPIST_PROFILE_NOT_PENDING_REVIEW" });
    expect(updateTherapistMock).toHaveBeenCalledTimes(1);
    expect(createAuditMock).toHaveBeenCalledTimes(1);
    expect(sendApprovedEmailMock).toHaveBeenCalledTimes(1);
    expect(syncApprovedTherapistToWixMock).toHaveBeenCalledTimes(1);
  });

  it("commits approval and sends the approved email before syncing to Wix", async () => {
    syncApprovedTherapistToWixMock.mockResolvedValue({
      success: true,
      wixSubmissionId: "wix-submission-id",
      wixSyncedAt: new Date(),
    });

    const result = await approveTherapistReview("admin-id", "therapist-profile-id");

    expect(result.wixSync).toEqual({
      status: "synced",
      message: "Therapist approved and synchronized with Wix.",
    });
    expect(updateTherapistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvalStatus: TherapistApprovalStatus.APPROVED,
          isApproved: true,
        }),
      }),
    );
    expect(updateTherapistMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendApprovedEmailMock.mock.invocationCallOrder[0],
    );
    expect(sendApprovedEmailMock.mock.invocationCallOrder[0]).toBeLessThan(
      syncApprovedTherapistToWixMock.mock.invocationCallOrder[0],
    );
  });

  it("returns a partial failure result without rolling back the approved profile", async () => {
    syncApprovedTherapistToWixMock.mockRejectedValue(new Error("Wix unavailable"));

    const result = await approveTherapistReview("admin-id", "therapist-profile-id");

    expect(result.therapistProfile.approvalStatus).toBe(TherapistApprovalStatus.APPROVED);
    expect(result.therapistProfile.isApproved).toBe(true);
    expect(result.wixSync).toEqual({
      status: "failed",
      message:
        "Therapist approved, but synchronization with Wix failed. Please retry the synchronization.",
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
