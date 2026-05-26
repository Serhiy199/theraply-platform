import { afterEach, describe, expect, it, vi } from "vitest";

import { approveTherapistAction } from "@/app/admin/therapists/actions";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const requireActionRoleMock = vi.hoisted(() => vi.fn());
const approveTherapistReviewMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/permissions", () => ({
  ActionPermissionError: class ActionPermissionError extends Error {},
  requireActionRole: requireActionRoleMock,
}));

vi.mock("@/server/services/admin-operations.service", () => ({
  AdminOperationsServiceError: class AdminOperationsServiceError extends Error {},
  approveTherapistReview: approveTherapistReviewMock,
  rejectTherapistReview: vi.fn(),
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
