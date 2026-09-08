import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profileFindUnique: vi.fn(),
  findItems: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  diagnostic: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: { findUnique: mocks.profileFindUnique },
  },
}));

vi.mock("@/lib/wix/wix-cms-client", () => ({
  findWixCmsTherapistsByTheraplyId: mocks.findItems,
  createWixCmsTherapist: mocks.createItem,
  updateWixCmsTherapist: mocks.updateItem,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  logDiagnosticEvent: mocks.diagnostic,
}));

import {
  reconcileTherapistPublicProfile,
  WixCmsTherapistSyncError,
} from "@/server/services/wix-cms-therapist-sync.service";
import { WixApiRequestError } from "@/lib/wix/wix-client";

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-id",
    displayName: "Test Therapist",
    bio: "Public bio",
    specialization: "Anxiety",
    therapyServicesProvided: "Individual therapy",
    yearsOfExperience: "5",
    profilePhotoUrl: "https://cdn.example/photo.jpg",
    sessionPricePence: 6000,
    approvalStatus: TherapistApprovalStatus.APPROVED,
    isApproved: true,
    onboardingCompleted: true,
    isGoogleCalendarConnected: true,
    googleCalendarId: "calendar-id",
    googleRefreshToken: "refresh-token",
    stripeAccountId: "acct_test",
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    user: {
      id: "user-id",
      role: UserRole.THERAPIST,
      isActive: true,
      emailVerified: true,
    },
    ...overrides,
  };
}

const existingData = {
  theraplyId: "profile-id",
  displayName: "Test Therapist",
  bio: "Public bio",
  specialization: "Anxiety",
  therapyServicesProvided: "Individual therapy",
  yearsOfExperience: "5",
  profilePhoto: "https://cdn.example/photo.jpg",
  sessionPricePence: 6000,
  sessionPriceDisplay: "£60",
  bookingUrl: "https://staging.example/client/book/user-id",
  isBookable: true,
  isPublished: true,
};

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging.example");
  mocks.profileFindUnique.mockResolvedValue(buildProfile());
  mocks.findItems.mockResolvedValue([]);
  mocks.createItem.mockImplementation(async (data) => ({
    id: "wix-item-id",
    revision: "1",
    data,
  }));
  mocks.updateItem.mockImplementation(async (item, data) => ({
    ...item,
    revision: "2",
    data,
  }));
});

describe("Wix CMS therapist reconciliation", () => {
  it("creates one item when canonical public readiness passes", async () => {
    await expect(reconcileTherapistPublicProfile("profile-id")).resolves.toMatchObject({
      status: "CREATED",
      wixItemId: "wix-item-id",
      matchCount: 1,
      publicReady: true,
    });
    expect(mocks.createItem).toHaveBeenCalledTimes(1);
  });

  it("updates the same existing item without creating a duplicate", async () => {
    mocks.findItems.mockResolvedValue([
      { id: "wix-item-id", revision: "1", data: { ...existingData, bio: "Old bio" } },
    ]);

    await expect(reconcileTherapistPublicProfile("profile-id")).resolves.toMatchObject({
      status: "UPDATED",
      wixItemId: "wix-item-id",
      matchCount: 1,
    });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wix-item-id", revision: "1" }),
      expect.objectContaining({ bio: "Public bio", isPublished: true }),
    );
  });

  it("skips an unready therapist with no existing Wix item", async () => {
    mocks.profileFindUnique.mockResolvedValue(buildProfile({ profilePhotoUrl: null }));

    await expect(reconcileTherapistPublicProfile("profile-id")).resolves.toMatchObject({
      status: "SKIPPED_NOT_PUBLIC_READY",
      wixItemId: null,
      matchCount: 0,
      publicReady: false,
    });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("hides the same existing item while preserving last known public fields", async () => {
    mocks.profileFindUnique.mockResolvedValue(buildProfile({ profilePhotoUrl: null }));
    mocks.findItems.mockResolvedValue([
      { id: "wix-item-id", revision: "7", data: existingData },
    ]);

    await expect(reconcileTherapistPublicProfile("profile-id")).resolves.toMatchObject({
      status: "HIDDEN",
      wixItemId: "wix-item-id",
      publicReady: false,
    });
    expect(mocks.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wix-item-id", revision: "7" }),
      { ...existingData, isBookable: false, isPublished: false },
    );
  });

  it("restores the same hidden item when canonical readiness recovers", async () => {
    mocks.findItems.mockResolvedValue([
      {
        id: "wix-item-id",
        revision: "8",
        data: { ...existingData, isBookable: false, isPublished: false },
      },
    ]);

    await expect(reconcileTherapistPublicProfile("profile-id")).resolves.toMatchObject({
      status: "UPDATED",
      wixItemId: "wix-item-id",
      matchCount: 1,
      publicReady: true,
    });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "wix-item-id", revision: "8" }),
      expect.objectContaining({ isBookable: true, isPublished: true }),
    );
  });

  it("returns no change for an identical repeated sync", async () => {
    mocks.findItems.mockResolvedValue([
      { id: "wix-item-id", revision: "2", data: existingData },
    ]);

    await expect(reconcileTherapistPublicProfile("profile-id")).resolves.toMatchObject({
      status: "NO_CHANGE",
      wixItemId: "wix-item-id",
      matchCount: 1,
    });
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("fails closed when duplicate theraplyId items are returned", async () => {
    mocks.findItems.mockResolvedValue([
      { id: "wix-item-1", revision: "1", data: existingData },
      { id: "wix-item-2", revision: "1", data: existingData },
    ]);

    await expect(reconcileTherapistPublicProfile("profile-id")).rejects.toMatchObject({
      code: "WIX_CMS_DUPLICATE_THERAPIST_ID",
    } satisfies Partial<WixCmsTherapistSyncError>);
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("retains only sanitized Wix failure diagnostics", async () => {
    mocks.createItem.mockRejectedValue(
      new WixApiRequestError("The Wix API request failed.", 400, {
        message: "Invalid request",
        details: {
          applicationError: {
            code: "WDE0110",
            description: "The site code editor is disabled.",
          },
        },
        authorization: "IST.must-not-leak-secret-value",
        requestPayload: { privateField: "must-not-leak" },
      }),
    );

    await expect(
      reconcileTherapistPublicProfile("profile-id"),
    ).rejects.toMatchObject({
      code: "WIX_CMS_SYNC_FAILED",
      diagnostic: {
        operation: "CREATE_THERAPIST",
        httpStatus: 400,
        wixErrorCode: "WDE0110",
        wixErrorMessage: "The site code editor is disabled.",
      },
    });
    expect(mocks.diagnostic).toHaveBeenCalledWith(
      "wix-cms-therapist-sync",
      "Unable to reconcile therapist public profile with Wix CMS.",
      {
        therapistProfileId: "profile-id",
        wixError: {
          operation: "CREATE_THERAPIST",
          httpStatus: 400,
          wixErrorCode: "WDE0110",
          wixErrorMessage: "The site code editor is disabled.",
        },
      },
    );
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("must-not-leak");
  });
});
