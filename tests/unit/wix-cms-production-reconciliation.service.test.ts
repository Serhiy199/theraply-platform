import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getCollection: vi.fn(),
  listIndexes: vi.fn(),
  listItems: vi.fn(),
  findMany: vi.fn(),
  reconcile: vi.fn(),
  mapProfile: vi.fn(),
}));

vi.mock("@/lib/wix/wix-cms-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wix/wix-cms-config")>();
  return { ...actual, getWixCmsConfig: mocks.getConfig };
});

vi.mock("@/lib/wix/wix-cms-client", () => ({
  getWixCmsTherapistsCollection: mocks.getCollection,
  listWixCmsTherapistIndexes: mocks.listIndexes,
  listAllWixCmsTherapists: mocks.listItems,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: { findMany: mocks.findMany },
  },
}));

vi.mock("@/server/services/wix-cms-therapist-sync.service", () => ({
  wixCmsTherapistProfileSelect: {},
  reconcileTherapistPublicProfile: mocks.reconcile,
  mapTherapistToWixCmsItem: mocks.mapProfile,
}));

import {
  runWixCmsProductionReconciliation,
  WIX_PRODUCTION_RECONCILIATION_CONFIRMATION,
} from "@/server/services/wix-cms-production-reconciliation.service";
import { WixCmsConfigError } from "@/lib/wix/wix-cms-config";

const validFields = [
  ["theraplyId", "TEXT"],
  ["displayName", "TEXT"],
  ["bio", "RICH_TEXT"],
  ["specialization", "TEXT"],
  ["therapyServicesProvided", "TEXT"],
  ["yearsOfExperience", "TEXT"],
  ["profilePhoto", "IMAGE"],
  ["sessionPricePence", "NUMBER"],
  ["sessionPriceDisplay", "TEXT"],
  ["bookingUrl", "URL"],
  ["isBookable", "BOOLEAN"],
  ["isPublished", "BOOLEAN"],
].map(([key, type]) => ({ key, type }));

function buildProfile(id = "profile-1") {
  return {
    id,
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
      id: `user-${id}`,
      role: UserRole.THERAPIST,
      isActive: true,
      emailVerified: true,
    },
  };
}

function projection(id = "profile-1") {
  return {
    theraplyId: id,
    displayName: "Test Therapist",
    bio: "Public bio",
    specialization: "Anxiety",
    therapyServicesProvided: "Individual therapy",
    yearsOfExperience: "5",
    profilePhoto: "https://cdn.example/photo.jpg",
    sessionPricePence: 6000,
    sessionPriceDisplay: "£60",
    bookingUrl: `https://platform.theraply.online/client/book/user-${id}`,
    isBookable: true,
    isPublished: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://platform.theraply.online");
  mocks.getConfig.mockReturnValue({
    apiToken: "cms-token",
    environment: "production",
    siteId: "production-site-id",
    collectionId: "Therapists",
  });
  mocks.getCollection.mockResolvedValue({ id: "Therapists", fields: validFields });
  mocks.listIndexes.mockResolvedValue([
    {
      name: "theraplyId_unique",
      status: "ACTIVE",
      unique: true,
      fields: [{ path: "theraplyId" }],
    },
  ]);
  mocks.listItems.mockResolvedValue([]);
  mocks.findMany.mockResolvedValue([buildProfile()]);
  mocks.mapProfile.mockImplementation((profile) => projection(profile.id));
  mocks.reconcile.mockResolvedValue({
    status: "CREATED",
    therapistProfileId: "profile-1",
    wixItemId: "item-1",
    matchCount: 1,
    publicReady: true,
  });
});

describe("production Wix CMS reconciliation preflight", () => {
  it("defaults to dry-run and performs no reconciliation writes", async () => {
    await expect(runWixCmsProductionReconciliation()).resolves.toMatchObject({
      mode: "DRY_RUN",
      eligibleCount: 1,
      eligibleProfileIds: ["profile-1"],
      plans: [{ therapistProfileId: "profile-1", action: "CREATE" }],
      results: [],
    });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("plans update and no-change from the read-only Wix inventory", async () => {
    mocks.findMany.mockResolvedValue([buildProfile("profile-1"), buildProfile("profile-2")]);
    mocks.listItems.mockResolvedValue([
      { id: "item-1", data: { ...projection("profile-1"), bio: "Old bio" } },
      { id: "item-2", data: projection("profile-2") },
    ]);

    const report = await runWixCmsProductionReconciliation({ expectedCount: 2 });
    expect(report.plans).toEqual([
      { therapistProfileId: "profile-1", action: "UPDATE", wixItemId: "item-1" },
      { therapistProfileId: "profile-2", action: "NO_CHANGE", wixItemId: "item-2" },
    ]);
  });

  it("fails closed for missing CMS configuration", async () => {
    mocks.getConfig.mockImplementation(() => {
      throw new WixCmsConfigError("Missing CMS token.", "WIX_CMS_CONFIG_MISSING");
    });

    await expect(runWixCmsProductionReconciliation()).rejects.toMatchObject({
      code: "WIX_CMS_CONFIG_MISSING",
    });
  });

  it("fails closed for a non-production CMS environment", async () => {
    mocks.getConfig.mockReturnValue({
      apiToken: "cms-token",
      environment: "staging",
      siteId: "staging-site-id",
      collectionId: "Therapists",
    });

    await expect(runWixCmsProductionReconciliation()).rejects.toMatchObject({
      code: "PRODUCTION_ENVIRONMENT_REQUIRED",
    });
  });

  it("fails closed for a non-canonical or non-HTTPS app URL", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    await expect(runWixCmsProductionReconciliation()).rejects.toMatchObject({
      code: "PRODUCTION_URL_REQUIRED",
    });
  });

  it("fails closed for incompatible schema or a missing unique index", async () => {
    mocks.getCollection.mockResolvedValue({
      id: "Therapists",
      fields: validFields.filter((field) => field.key !== "bio"),
    });
    await expect(runWixCmsProductionReconciliation()).rejects.toMatchObject({
      code: "COLLECTION_SCHEMA_MISMATCH",
    });

    mocks.getCollection.mockResolvedValue({ id: "Therapists", fields: validFields });
    mocks.listIndexes.mockResolvedValue([]);
    await expect(runWixCmsProductionReconciliation()).rejects.toMatchObject({
      code: "UNIQUE_INDEX_REQUIRED",
    });
  });

  it("fails closed for duplicate Wix identities", async () => {
    mocks.listItems.mockResolvedValue([
      { id: "item-1", data: projection() },
      { id: "item-2", data: projection() },
    ]);
    await expect(runWixCmsProductionReconciliation()).rejects.toMatchObject({
      code: "DUPLICATE_WIX_IDENTITY",
    });
  });

  it("stops when the confirmed eligible count does not match", async () => {
    await expect(
      runWixCmsProductionReconciliation({ expectedCount: 2 }),
    ).rejects.toMatchObject({ code: "EXPECTED_COUNT_MISMATCH" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});

describe("production Wix CMS reconciliation write gate", () => {
  const writeOptions = {
    write: true,
    expectedCount: 1,
    allowProfileIds: ["profile-1"],
    confirmation: WIX_PRODUCTION_RECONCILIATION_CONFIRMATION,
  };

  it("requires the exact production confirmation", async () => {
    await expect(
      runWixCmsProductionReconciliation({
        ...writeOptions,
        confirmation: "not-confirmed",
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_CONFIRMATION_REQUIRED" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("requires an allowlist equal to the canonical eligible set", async () => {
    await expect(
      runWixCmsProductionReconciliation({
        ...writeOptions,
        allowProfileIds: ["different-profile"],
      }),
    ).rejects.toMatchObject({ code: "ALLOWLIST_MISMATCH" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("reconciles only the confirmed exact allowlist after all gates pass", async () => {
    await expect(
      runWixCmsProductionReconciliation(writeOptions),
    ).resolves.toMatchObject({
      mode: "WRITE",
      results: [{ therapistProfileId: "profile-1", action: "CREATE" }],
    });
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.reconcile).toHaveBeenCalledWith("profile-1");
  });
});
