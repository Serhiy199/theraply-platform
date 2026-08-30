import {
  TherapistApprovalStatus,
  UserRole,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildBookableTherapistWhere,
  evaluateTherapistReadiness,
} from "@/lib/therapist-readiness";

const readyUser = {
  role: UserRole.THERAPIST,
  isActive: true,
  emailVerified: true,
};

const readyProfile = {
  approvalStatus: TherapistApprovalStatus.APPROVED,
  isApproved: true,
  onboardingCompleted: true,
  sessionPricePence: 6000,
  isGoogleCalendarConnected: true,
  googleCalendarId: "primary",
  googleRefreshToken: "stored-refresh-capability",
  stripeAccountId: "acct_test",
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  displayName: "Ready Therapist",
  bio: "A useful professional biography.",
  specialization: "Anxiety",
  therapyServicesProvided: "Individual therapy",
  yearsOfExperience: "8",
  profilePhotoUrl: "https://example.test/photo.jpg",
};

describe("evaluateTherapistReadiness", () => {
  it("marks a fully ready therapist as booking-ready and public-ready", () => {
    expect(
      evaluateTherapistReadiness({ user: readyUser, profile: readyProfile }),
    ).toEqual({ bookingReady: true, publicReady: true, reasons: [] });
  });

  it.each([
    ["non-therapist role", { user: { role: UserRole.CLIENT } }, "NOT_THERAPIST"],
    ["inactive account", { user: { isActive: false } }, "ACCOUNT_INACTIVE"],
    ["unverified email", { user: { emailVerified: false } }, "EMAIL_NOT_VERIFIED"],
    [
      "non-approved status",
      { profile: { approvalStatus: TherapistApprovalStatus.PENDING_REVIEW } },
      "NOT_APPROVED",
    ],
    ["legacy approval flag false", { profile: { isApproved: false } }, "NOT_APPROVED"],
    ["incomplete onboarding", { profile: { onboardingCompleted: false } }, "ONBOARDING_INCOMPLETE"],
    ["missing price", { profile: { sessionPricePence: null } }, "PRICE_MISSING"],
    ["zero price", { profile: { sessionPricePence: 0 } }, "PRICE_MISSING"],
    ["negative price", { profile: { sessionPricePence: -1 } }, "PRICE_MISSING"],
    [
      "disconnected Calendar",
      { profile: { isGoogleCalendarConnected: false } },
      "CALENDAR_NOT_READY",
    ],
    ["missing Calendar ID", { profile: { googleCalendarId: " " } }, "CALENDAR_NOT_READY"],
    [
      "missing Calendar refresh capability",
      { profile: { googleRefreshToken: null } },
      "CALENDAR_NOT_READY",
    ],
    ["missing Stripe account", { profile: { stripeAccountId: " " } }, "STRIPE_NOT_READY"],
    ["Stripe payouts disabled", { profile: { stripePayoutsEnabled: false } }, "STRIPE_NOT_READY"],
    [
      "Stripe details incomplete",
      { profile: { stripeDetailsSubmitted: false } },
      "STRIPE_NOT_READY",
    ],
  ])("rejects booking readiness for %s", (_label, overrides, expectedReason) => {
    const result = evaluateTherapistReadiness({
      user: { ...readyUser, ...("user" in overrides ? overrides.user : {}) },
      profile: {
        ...readyProfile,
        ...("profile" in overrides ? overrides.profile : {}),
      },
    });

    expect(result.bookingReady).toBe(false);
    expect(result.publicReady).toBe(false);
    expect(result.reasons).toContain(expectedReason);
  });

  it.each([
    ["displayName", { displayName: " " }],
    ["bio", { bio: null }],
    ["specialization", { specialization: "" }],
    ["services", { therapyServicesProvided: " " }],
    ["experience", { yearsOfExperience: null }],
    ["photo", { profilePhotoUrl: "" }],
  ])("keeps booking readiness but rejects public readiness without %s", (_label, override) => {
    const result = evaluateTherapistReadiness({
      user: readyUser,
      profile: { ...readyProfile, ...override },
    });

    expect(result).toEqual({
      bookingReady: true,
      publicReady: false,
      reasons: ["PUBLIC_PROFILE_INCOMPLETE"],
    });
  });
});

describe("buildBookableTherapistWhere", () => {
  it("represents every query-compatible booking readiness condition", () => {
    expect(buildBookableTherapistWhere()).toEqual({
      role: UserRole.THERAPIST,
      isActive: true,
      emailVerified: true,
      therapistProfile: {
        is: {
          approvalStatus: TherapistApprovalStatus.APPROVED,
          isApproved: true,
          onboardingCompleted: true,
          sessionPricePence: { gt: 0 },
          isGoogleCalendarConnected: true,
          googleCalendarId: { not: "" },
          googleRefreshToken: { not: "" },
          stripeAccountId: { not: "" },
          stripePayoutsEnabled: true,
          stripeDetailsSubmitted: true,
        },
      },
    });
  });
});
