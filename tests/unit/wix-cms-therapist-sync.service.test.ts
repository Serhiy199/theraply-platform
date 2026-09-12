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
import { parseTargetedDepublishArgs, runTargetedWixDepublication, TARGETED_DEPUBLISH_CONFIRMATION } from "@/server/services/wix-cms-targeted-depublication.service";

vi.mock("@/lib/wix/wix-cms-config", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/wix/wix-cms-config")>(), getWixCmsConfig: () => ({ environment: "production" }) }));

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
  bioDisplay: "Public bio",
  specialization: "Anxiety",
  therapyServicesProvided: "Individual therapy",
  yearsOfExperience: "5 years of experience",
  profilePhoto: "https://cdn.example/photo.jpg",
  sessionPricePence: 6000,
  sessionPriceDisplay: "£60/hour",
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

describe("targeted Wix soft depublication", () => {
  const options = { profileId: "profile-id", expectedWixItemId: "wix-item-id", confirmation: TARGETED_DEPUBLISH_CONFIRMATION };
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://platform.theraply.online");
    mocks.profileFindUnique.mockResolvedValue(buildProfile({ user: { id: "user-id", role: UserRole.THERAPIST, isActive: false, emailVerified: true } }));
    mocks.findItems.mockResolvedValue([{ id: "wix-item-id", revision: "7", data: existingData }]);
  });

  it("defaults to dry run without any mutations", async () => {
    const parsed = parseTargetedDepublishArgs(["--profile-id=profile-id", "--expected-wix-item-id=wix-item-id", `--confirm-production=${TARGETED_DEPUBLISH_CONFIRMATION}`]);
    expect(parsed.write).toBe(false);
    await expect(runTargetedWixDepublication(parsed)).resolves.toMatchObject({ mode: "DRY_RUN", action: "HIDDEN" });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("preserves content, never creates, and becomes idempotent", async () => {
    await expect(runTargetedWixDepublication({ ...options, write: true })).resolves.toMatchObject({ action: "HIDDEN" });
    const hidden = { ...existingData, isPublished: false, isBookable: false };
    expect(mocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({ id: "wix-item-id" }), hidden);
    mocks.findItems.mockResolvedValue([{ id: "wix-item-id", revision: "8", data: hidden }]);
    await expect(runTargetedWixDepublication(options)).resolves.toMatchObject({ action: "NO_CHANGE" });
    await expect(runTargetedWixDepublication({ ...options, write: true })).resolves.toMatchObject({ action: "NO_CHANGE" });
    expect(mocks.updateItem).toHaveBeenCalledTimes(1);
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it.each([[], [{ id: "other-item", data: existingData }], [{ id: "wix-item-id", data: { ...existingData, theraplyId: "other-profile" } }], [{ id: "wix-item-id", data: existingData }, { id: "duplicate", data: existingData }]])("rejects absent, foreign or duplicate identities", async (...items) => {
    mocks.findItems.mockResolvedValue(items);
    await expect(runTargetedWixDepublication({ ...options, write: true })).rejects.toThrow();
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it("rechecks readiness immediately in canonical write flow", async () => {
    const inactive = buildProfile({ user: { id: "user-id", role: UserRole.THERAPIST, isActive: false, emailVerified: true } });
    mocks.profileFindUnique.mockResolvedValueOnce(inactive).mockResolvedValueOnce(buildProfile());
    await expect(runTargetedWixDepublication({ ...options, write: true })).rejects.toThrow();
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateItem).not.toHaveBeenCalled();
  });

  it.each([{ args: [] }, { args: ["--profile-id=*"] }, { args: ["--all"] }, { args: ["--write=true"] }, { args: ["--write", "--write"] }])("rejects unsafe arguments", ({ args }) => {
    expect(() => parseTargetedDepublishArgs(args)).toThrow();
  });
});
