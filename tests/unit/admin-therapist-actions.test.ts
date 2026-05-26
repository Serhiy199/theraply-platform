import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveTherapistAction,
  retryWixTherapistSyncAction,
} from "@/app/admin/therapists/actions";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const requireActionRoleMock = vi.hoisted(() => vi.fn());
const approveTherapistReviewMock = vi.hoisted(() => vi.fn());
const syncApprovedTherapistToWixMock = vi.hoisted(() => vi.fn());
const errorClasses = vi.hoisted(() => ({
  ActionPermissionError: class ActionPermissionError extends Error {},
  WixTherapistSyncServiceError: class WixTherapistSyncServiceError extends Error {},
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/permissions", () => ({
  ActionPermissionError: errorClasses.ActionPermissionError,
  requireActionRole: requireActionRoleMock,
}));

vi.mock("@/server/services/admin-operations.service", () => ({
  AdminOperationsServiceError: class AdminOperationsServiceError extends Error {},
  approveTherapistReview: approveTherapistReviewMock,
  rejectTherapistReview: vi.fn(),
}));

vi.mock("@/server/services/wix-therapist-sync.service", () => ({
  syncApprovedTherapistToWix: syncApprovedTherapistToWixMock,
  WixTherapistSyncServiceError: errorClasses.WixTherapistSyncServiceError,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("approveTherapistAction Wix message", () => {
  it("redirects to a synchronized feedback banner after approval", async () => {
    requireActionRoleMock.mockResolvedValue({ id: "admin-id" });
    approveTherapistReviewMock.mockResolvedValue({
      therapistProfile: { id: "therapist-profile-id" },
      wixSync: {
        status: "synced",
        message: "Терапевта погоджено та синхронізовано з Wix.",
      },
    });
    const formData = new FormData();
    formData.set("therapistProfileId", "therapist-profile-id");

    await approveTherapistAction({ status: "idle" }, formData);

    expect(redirectMock).toHaveBeenCalledWith("/admin/therapists?wixSync=synced");
  });

  it("redirects to a partial failure feedback banner after approval", async () => {
    requireActionRoleMock.mockResolvedValue({ id: "admin-id" });
    approveTherapistReviewMock.mockResolvedValue({
      therapistProfile: { id: "therapist-profile-id" },
      wixSync: {
        status: "failed",
        message:
          "Терапевта погоджено, але не вдалося синхронізувати з Wix. Спробуйте повторити синхронізацію.",
      },
    });
    const formData = new FormData();
    formData.set("therapistProfileId", "therapist-profile-id");

    await approveTherapistAction({ status: "idle" }, formData);

    expect(redirectMock).toHaveBeenCalledWith("/admin/therapists?wixSync=failed");
  });
});

describe("retryWixTherapistSyncAction", () => {
  it("retries Wix sync for an authenticated admin and revalidates admin surfaces", async () => {
    requireActionRoleMock.mockResolvedValue({ id: "admin-id" });
    syncApprovedTherapistToWixMock.mockResolvedValue({
      success: true,
      wixSubmissionId: "wix-submission-id",
      wixSyncedAt: new Date(),
    });
    const formData = new FormData();
    formData.set("therapistProfileId", "therapist-profile-id");

    await expect(
      retryWixTherapistSyncAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "success",
      message: "Терапевта успішно синхронізовано з Wix.",
    });

    expect(syncApprovedTherapistToWixMock).toHaveBeenCalledWith("therapist-profile-id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/therapists");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("validates the therapist id before attempting retry sync", async () => {
    requireActionRoleMock.mockResolvedValue({ id: "admin-id" });

    await expect(
      retryWixTherapistSyncAction({ status: "idle" }, new FormData()),
    ).resolves.toEqual({
      status: "error",
      message: "Не вказано профіль терапевта для синхронізації.",
    });

    expect(syncApprovedTherapistToWixMock).not.toHaveBeenCalled();
  });

  it("returns the permission error for non-admin retry requests", async () => {
    requireActionRoleMock.mockRejectedValue(new errorClasses.ActionPermissionError());
    const formData = new FormData();
    formData.set("therapistProfileId", "therapist-profile-id");

    await expect(
      retryWixTherapistSyncAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      message: "You do not have permission to perform this action.",
    });

    expect(syncApprovedTherapistToWixMock).not.toHaveBeenCalled();
  });

  it("returns the Ukrainian retry failure message when approved sync fails", async () => {
    requireActionRoleMock.mockResolvedValue({ id: "admin-id" });
    syncApprovedTherapistToWixMock.mockRejectedValue(
      new errorClasses.WixTherapistSyncServiceError(),
    );
    const formData = new FormData();
    formData.set("therapistProfileId", "therapist-profile-id");

    await expect(
      retryWixTherapistSyncAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      message:
        "Не вдалося синхронізувати терапевта з Wix. Перевірте помилку та повторіть спробу.",
    });
  });
});
