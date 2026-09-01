import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertWixCmsEnvironment,
  getWixCmsConfig,
  WIX_CMS_PRODUCTION_SITE_ID,
  WIX_CMS_STAGING_SITE_ID,
} from "@/lib/wix/wix-cms-config";
import {
  formatWixCmsSessionPrice,
  mapTherapistToWixCmsItem,
  type WixCmsTherapistProfile,
} from "@/server/services/wix-cms-therapist-sync.service";

function buildProfile(): WixCmsTherapistProfile {
  return {
    id: "therapist-profile-id",
    displayName: "Test Therapist",
    bio: "Public biography",
    specialization: "Anxiety",
    therapyServicesProvided: "Individual therapy",
    yearsOfExperience: "8",
    profilePhotoUrl: "https://cdn.example/therapist.jpg",
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
      id: "therapist-user-id",
      role: UserRole.THERAPIST,
      isActive: true,
      emailVerified: true,
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Wix CMS environment guard", () => {
  it("allows matching staging and production site identities", () => {
    expect(() => assertWixCmsEnvironment("staging", WIX_CMS_STAGING_SITE_ID)).not.toThrow();
    expect(() =>
      assertWixCmsEnvironment("production", WIX_CMS_PRODUCTION_SITE_ID),
    ).not.toThrow();
  });

  it("loads the dedicated CMS token", () => {
    vi.stubEnv("WIX_CMS_API_TOKEN", "cms-token");
    vi.stubEnv("WIX_CMS_ENVIRONMENT", "staging");
    vi.stubEnv("WIX_CMS_SITE_ID", WIX_CMS_STAGING_SITE_ID);

    expect(getWixCmsConfig()).toMatchObject({
      apiToken: "cms-token",
      environment: "staging",
      siteId: WIX_CMS_STAGING_SITE_ID,
    });
  });

  it("does not fall back to the Forms token", () => {
    vi.stubEnv("WIX_API_TOKEN", "forms-token");
    vi.stubEnv("WIX_CMS_API_TOKEN", "");
    vi.stubEnv("WIX_CMS_ENVIRONMENT", "staging");
    vi.stubEnv("WIX_CMS_SITE_ID", WIX_CMS_STAGING_SITE_ID);

    expect(() => getWixCmsConfig()).toThrowError(
      expect.objectContaining({ code: "WIX_CMS_CONFIG_MISSING" }),
    );
  });

  it("blocks staging with the production site and production with staging", () => {
    expect(() =>
      assertWixCmsEnvironment("staging", WIX_CMS_PRODUCTION_SITE_ID),
    ).toThrowError(
      expect.objectContaining({ code: "WIX_CMS_ENVIRONMENT_MISMATCH" }),
    );
    expect(() =>
      assertWixCmsEnvironment("production", WIX_CMS_STAGING_SITE_ID),
    ).toThrowError(
      expect.objectContaining({ code: "WIX_CMS_ENVIRONMENT_MISMATCH" }),
    );
  });

  it.each(["WIX_CMS_API_TOKEN", "WIX_CMS_ENVIRONMENT", "WIX_CMS_SITE_ID"])(
    "blocks missing %s",
    (missingName) => {
      vi.stubEnv("WIX_CMS_API_TOKEN", "cms-token");
      vi.stubEnv("WIX_CMS_ENVIRONMENT", "staging");
      vi.stubEnv("WIX_CMS_SITE_ID", WIX_CMS_STAGING_SITE_ID);
      vi.stubEnv(missingName, "");

      expect(() => getWixCmsConfig()).toThrowError(
        expect.objectContaining({ code: "WIX_CMS_CONFIG_MISSING" }),
      );
    },
  );

  it("blocks an unknown CMS environment", () => {
    vi.stubEnv("WIX_CMS_API_TOKEN", "cms-token");
    vi.stubEnv("WIX_CMS_ENVIRONMENT", "preview");
    vi.stubEnv("WIX_CMS_SITE_ID", WIX_CMS_STAGING_SITE_ID);

    expect(() => getWixCmsConfig()).toThrowError(
      expect.objectContaining({ code: "WIX_CMS_CONFIG_MISSING" }),
    );
  });
});

describe("Wix CMS therapist projection", () => {
  it("maps only canonical public fields and uses different CMS/booking identities", () => {
    vi.stubEnv("APP_URL", "https://theraply-platform.vercel.app/");

    const result = mapTherapistToWixCmsItem(buildProfile());

    expect(result).toEqual({
      theraplyId: "therapist-profile-id",
      displayName: "Test Therapist",
      bio: "Public biography",
      specialization: "Anxiety",
      therapyServicesProvided: "Individual therapy",
      yearsOfExperience: "8",
      profilePhoto: "https://cdn.example/therapist.jpg",
      sessionPricePence: 6000,
      sessionPriceDisplay: "£60",
      bookingUrl:
        "https://theraply-platform.vercel.app/client/book/therapist-user-id",
      isBookable: true,
      isPublished: true,
    });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("googleRefreshToken");
    expect(result).not.toHaveProperty("stripeAccountId");
  });

  it("formats positive integer pence deterministically", () => {
    expect(formatWixCmsSessionPrice(6000)).toBe("£60");
    expect(formatWixCmsSessionPrice(6500)).toBe("£65");
    expect(formatWixCmsSessionPrice(6550)).toBe("£65.50");
    expect(() => formatWixCmsSessionPrice(0)).toThrow();
    expect(() => formatWixCmsSessionPrice(10.5)).toThrow();
  });
});
