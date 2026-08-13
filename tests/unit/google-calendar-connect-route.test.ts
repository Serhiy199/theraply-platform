import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/integrations/google/connect/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireActionActiveTherapistFeaturesMock = vi.hoisted(() => vi.fn());
const buildConnectUrlMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    requireActionActiveTherapistFeatures: requireActionActiveTherapistFeaturesMock,
  };
});
vi.mock("@/server/services/google-calendar.service", () => ({
  GoogleCalendarServiceError: class GoogleCalendarServiceError extends Error {},
  buildTherapistGoogleCalendarConnectUrl: buildConnectUrlMock,
}));
vi.mock("@/server/services/rate-limit.service", () => ({
  buildUserRateLimitIdentifier: vi.fn(() => "google:user:therapist-user-id"),
  checkRateLimitPreset: checkRateLimitPresetMock,
}));
vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: vi.fn(),
  logDiagnosticEvent: vi.fn(),
}));

const therapistUser = {
  id: "therapist-user-id",
  email: "therapist@example.com",
  role: UserRole.THERAPIST,
};

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example");
  getCurrentUserMock.mockResolvedValue(therapistUser);
  requireActionActiveTherapistFeaturesMock.mockResolvedValue(therapistUser);
  checkRateLimitPresetMock.mockResolvedValue({ allowed: true });
  buildConnectUrlMock.mockResolvedValue("https://accounts.google.test/o/oauth2/v2/auth");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/integrations/google/connect", () => {
  it("preserves the external Google consent URL", async () => {
    const response = await GET(
      new NextRequest("https://localhost:3000/api/integrations/google/connect"),
    );

    expect(response.headers.get("location")).toBe(
      "https://accounts.google.test/o/oauth2/v2/auth",
    );
  });

  it("uses the canonical host for local error redirects", async () => {
    checkRateLimitPresetMock.mockResolvedValue({ allowed: false });

    const response = await GET(
      new NextRequest("https://localhost:3000/api/integrations/google/connect"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.pathname).toBe("/therapist/payout-details");
    expect(location.hostname).not.toBe("localhost");
  });
});
