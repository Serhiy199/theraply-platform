import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { ActionPermissionError } from "@/lib/permissions";
import { GET } from "@/app/api/stripe/connect/return/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireActionActiveTherapistFeaturesMock = vi.hoisted(() => vi.fn());
const syncTherapistStripeAccountStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();

  return {
    ...actual,
    requireActionActiveTherapistFeatures: requireActionActiveTherapistFeaturesMock,
  };
});

vi.mock("@/server/services/stripe-connect.service", () => ({
  StripeConnectServiceError: class StripeConnectServiceError extends Error {},
  syncTherapistStripeAccountStatus: syncTherapistStripeAccountStatusMock,
}));

const therapistUser = {
  id: "therapist-user-id",
  email: "therapist@example.com",
  role: UserRole.THERAPIST,
};

const internalRequest = new NextRequest(
  "https://localhost:3000/api/stripe/connect/return",
);

async function callRoute() {
  return (GET as (request: NextRequest) => Promise<Response>)(internalRequest);
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public-fallback.example");
  getCurrentUserMock.mockResolvedValue(therapistUser);
  requireActionActiveTherapistFeaturesMock.mockResolvedValue(therapistUser);
  syncTherapistStripeAccountStatusMock.mockResolvedValue({ isReady: true });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/stripe/connect/return", () => {
  it("redirects successful onboarding to the canonical host", async () => {
    const response = await callRoute();
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.pathname).toBe("/therapist/payout-details");
    expect(location.searchParams.get("stripe_status")).toBe("success");
    expect(location.searchParams.get("stripe_message")).toContain("connected and ready");
    expect(location.hostname).not.toBe("localhost");
  });

  it("redirects Stripe errors to the canonical host", async () => {
    syncTherapistStripeAccountStatusMock.mockRejectedValue(new Error("Stripe unavailable"));

    const response = await callRoute();
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.pathname).toBe("/therapist/payout-details");
    expect(location.searchParams.get("stripe_status")).toBe("error");
    expect(location.searchParams.get("stripe_message")).toBe(
      "Unable to refresh Stripe account status.",
    );
  });

  it("redirects unauthenticated users to canonical login", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await callRoute();

    expect(response.headers.get("location")).toBe("https://staging-or-test.example/login");
    expect(syncTherapistStripeAccountStatusMock).not.toHaveBeenCalled();
  });

  it("redirects non-therapists to canonical forbidden page", async () => {
    getCurrentUserMock.mockResolvedValue({ ...therapistUser, role: UserRole.ADMIN });

    const response = await callRoute();

    expect(response.headers.get("location")).toBe("https://staging-or-test.example/403");
    expect(syncTherapistStripeAccountStatusMock).not.toHaveBeenCalled();
  });

  it("redirects therapists without active features to canonical onboarding", async () => {
    requireActionActiveTherapistFeaturesMock.mockRejectedValue(new ActionPermissionError());

    const response = await callRoute();

    expect(response.headers.get("location")).toBe(
      `https://staging-or-test.example${THERAPIST_ONBOARDING_ROUTE}`,
    );
    expect(syncTherapistStripeAccountStatusMock).not.toHaveBeenCalled();
  });
});
