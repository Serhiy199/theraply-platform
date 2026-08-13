import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/stripe/connect/refresh/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireActionActiveTherapistFeaturesMock = vi.hoisted(() => vi.fn());
const createTherapistStripeAccountLinkMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());
const createAuditLogEntryBestEffortMock = vi.hoisted(() => vi.fn());
const logDiagnosticEventMock = vi.hoisted(() => vi.fn());

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
  createTherapistStripeAccountLink: createTherapistStripeAccountLinkMock,
}));

vi.mock("@/server/services/rate-limit.service", () => ({
  buildUserRateLimitIdentifier: vi.fn(() => "stripe-connect:user:therapist-user-id"),
  checkRateLimitPreset: checkRateLimitPresetMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: createAuditLogEntryBestEffortMock,
  logDiagnosticEvent: logDiagnosticEventMock,
}));

const therapistUser = {
  id: "therapist-user-id",
  email: "therapist@example.com",
  role: UserRole.THERAPIST,
};

const internalRequest = new NextRequest(
  "https://localhost:3000/api/stripe/connect/refresh",
);

async function callRoute() {
  return (GET as (request: NextRequest) => Promise<Response>)(internalRequest);
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example");
  getCurrentUserMock.mockResolvedValue(therapistUser);
  requireActionActiveTherapistFeaturesMock.mockResolvedValue(therapistUser);
  checkRateLimitPresetMock.mockResolvedValue({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: new Date("2026-08-13T00:00:00.000Z"),
    retryAfterSeconds: 0,
  });
  createTherapistStripeAccountLinkMock.mockResolvedValue({
    url: "https://connect.stripe.test/account-link",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/stripe/connect/refresh", () => {
  it("redirects unauthenticated refresh requests to canonical login", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const response = await callRoute();

    expect(response.headers.get("location")).toBe("https://staging-or-test.example/login");
    expect(createTherapistStripeAccountLinkMock).not.toHaveBeenCalled();
  });

  it("preserves the Stripe-hosted onboarding URL for active therapists", async () => {
    const response = await callRoute();

    expect(response.headers.get("location")).toBe("https://connect.stripe.test/account-link");
    expect(createTherapistStripeAccountLinkMock).toHaveBeenCalledWith("therapist-user-id");
  });

  it("redirects account-link errors to the canonical payout page", async () => {
    createTherapistStripeAccountLinkMock.mockRejectedValue(new Error("Stripe unavailable"));

    const response = await callRoute();
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.pathname).toBe("/therapist/payout-details");
    expect(location.searchParams.get("stripe_status")).toBe("error");
    expect(location.hostname).not.toBe("localhost");
  });
});
