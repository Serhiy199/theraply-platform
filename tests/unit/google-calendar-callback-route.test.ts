import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { ActionPermissionError } from "@/lib/permissions";
import { GET } from "@/app/api/integrations/google/callback/route";
import { GoogleCalendarServiceError } from "@/server/services/google-calendar.service";
import { createGoogleOAuthState } from "@/lib/google/google-oauth-state";
const claimMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create: claimMock } } }));
const secret = "unit-test-only-signing-key-not-a-real-secret";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireActionActiveTherapistFeaturesMock = vi.hoisted(() => vi.fn());
const completeConnectionMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());
const createAuditLogEntryBestEffortMock = vi.hoisted(() => vi.fn());
const logDiagnosticEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return {
    ...actual,
    requireActionActiveTherapistFeatures: requireActionActiveTherapistFeaturesMock,
  };
});

vi.mock("@/server/services/google-calendar.service", () => ({
  GoogleCalendarServiceError: class GoogleCalendarServiceError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly diagnostics?: Record<string, unknown>,
    ) {
      super(message);
    }
  },
  completeTherapistGoogleCalendarConnection: completeConnectionMock,
}));

vi.mock("@/server/services/rate-limit.service", () => ({
  buildUserRateLimitIdentifier: vi.fn(() => "google:user:therapist-user-id"),
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

function stateFor(userId = therapistUser.id, returnTo = "/therapist/payout-details") {
  return createGoogleOAuthState({ userId, session: "test-session", secret }, returnTo).state;
}

function requestWith(params: Record<string, string> = {}) {
  const url = new URL("https://localhost:3000/api/integrations/google/callback");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const nonce = params.state ? JSON.parse(Buffer.from(params.state.split(".")[0], "base64url").toString()).nonce : "";
  return new NextRequest(url, { headers: { cookie: `next-auth.session-token=test-session; theraply-google-state=${nonce}` } });
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example");
  vi.stubEnv("AUTH_SECRET", secret);
  claimMock.mockResolvedValue({});
  getCurrentUserMock.mockResolvedValue(therapistUser);
  requireActionActiveTherapistFeaturesMock.mockResolvedValue(therapistUser);
  checkRateLimitPresetMock.mockResolvedValue({ allowed: true });
  completeConnectionMock.mockResolvedValue({
    googleCalendarEmail: "therapist@gmail.test",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/integrations/google/callback", () => {
  it("redirects successful callbacks to the canonical staging host", async () => {
    const response = await GET(requestWith({ state: stateFor(), code: "authorization-code" }));
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.pathname).toBe("/therapist/payout-details");
    expect(location.searchParams.get("gc_status")).toBe("success");
    expect(location.hostname).not.toBe("localhost");
  });

  it("uses canonical redirects for login, forbidden, and onboarding", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await GET(requestWith())).headers.get("location")).toBe(
      "https://staging-or-test.example/login",
    );

    getCurrentUserMock.mockResolvedValueOnce({ ...therapistUser, role: UserRole.ADMIN });
    expect((await GET(requestWith())).headers.get("location")).toBe(
      "https://staging-or-test.example/403",
    );

    requireActionActiveTherapistFeaturesMock.mockRejectedValueOnce(new ActionPermissionError());
    expect((await GET(requestWith())).headers.get("location")).toBe(
      `https://staging-or-test.example${THERAPIST_ONBOARDING_ROUTE}`,
    );
  });

  it.each([
    [{}, "Google callback is missing state."],
    [{ state: stateFor() }, "Google callback did not include an authorization code."],
    [
      { state: stateFor(), error: "access_denied" },
      "Google authorization was cancelled or denied.",
    ],
    [
      { state: stateFor("different-user"), code: "authorization-code" },
      "Google authorization expired or is invalid. Please reconnect.",
    ],
  ])("handles invalid callback input on the canonical host", async (params, message) => {
    const response = await GET(requestWith(params));
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.searchParams.get("gc_status")).toBe("error");
    expect(location.searchParams.get("gc_message")).toBe(message);
  });

  it("returns a safe insufficient-scope error and logs scope names only", async () => {
    const diagnostics = {
      requestedScopes: ["openid", "email", "profile", "calendar-scope"],
      grantedScopes: ["openid", "email", "profile"],
      missingRequiredScopes: ["calendar-scope"],
    };
    completeConnectionMock.mockRejectedValue(
      new GoogleCalendarServiceError(
        "Google did not grant all required OAuth scopes.",
        "GOOGLE_OAUTH_SCOPES_INSUFFICIENT",
        diagnostics,
      ),
    );

    const response = await GET(requestWith({ state: stateFor(), code: "secret-code" }));
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.searchParams.get("gc_status")).toBe("error");
    expect(location.searchParams.get("gc_message")).toContain("required Calendar permissions");
    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      "google-calendar-callback-route",
      expect.any(String),
      expect.objectContaining({ oauthScopes: diagnostics }),
    );
    expect(JSON.stringify(logDiagnosticEventMock.mock.calls)).not.toContain("secret-code");
  });

  it("uses the canonical host for rate-limit responses", async () => {
    checkRateLimitPresetMock.mockResolvedValue({ allowed: false });

    const response = await GET(requestWith());
    const location = new URL(response.headers.get("location")!);

    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.searchParams.get("gc_status")).toBe("error");
  });

  it("does not exchange a code after replay or missing browser binding", async () => {
    claimMock.mockRejectedValueOnce(new Error("duplicate claim"));
    const response = await GET(requestWith({ state: stateFor(), code: "must-not-exchange" }));
    expect(new URL(response.headers.get("location")!).searchParams.get("gc_status")).toBe("error");
    expect(completeConnectionMock).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    const unbound = new NextRequest(`https://app.test/callback?state=${stateFor()}&code=must-not-exchange`);
    await GET(unbound);
    expect(completeConnectionMock).not.toHaveBeenCalled();
  });
});
