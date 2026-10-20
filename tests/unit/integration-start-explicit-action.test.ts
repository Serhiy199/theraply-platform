import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as stripeStart from "@/app/api/stripe/connect/account-link/route";
import * as googleStart from "@/app/api/integrations/google/connect/route";
import { ActionPermissionError } from "@/lib/permissions";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), activeTherapist: vi.fn(), stripeStart: vi.fn(),
  googleStart: vi.fn(), issueState: vi.fn(), rateLimit: vi.fn(), audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/permissions", () => ({
  ActionPermissionError: class ActionPermissionError extends Error {},
  hasRole: (role: string, allowed: string[]) => allowed.includes(role),
  requireActionActiveTherapistFeatures: mocks.activeTherapist,
}));
vi.mock("@/server/services/stripe-connect.service", () => ({
  createTherapistStripeAccountLink: mocks.stripeStart,
  StripeConnectServiceError: class StripeConnectServiceError extends Error {},
}));
vi.mock("@/server/services/google-calendar.service", () => ({
  buildTherapistGoogleCalendarConnectUrl: mocks.googleStart,
  GoogleCalendarServiceError: class GoogleCalendarServiceError extends Error {},
}));
vi.mock("@/server/services/google-oauth-state.service", () => ({
  issueGoogleOAuthState: mocks.issueState,
  googleStateCookieName: () => "test-google-state",
}));
vi.mock("@/server/services/rate-limit.service", () => ({
  checkRateLimitPreset: mocks.rateLimit,
  buildUserRateLimitIdentifier: () => "unit-test-therapist",
}));
vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: mocks.audit,
  logDiagnosticEvent: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://staging-or-test.example");
  const user = { id: "therapist-user-id", role: "THERAPIST" };
  mocks.user.mockResolvedValue(user);
  mocks.activeTherapist.mockResolvedValue(user);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.stripeStart.mockResolvedValue({ url: "https://connect.stripe.test/onboard" });
  mocks.googleStart.mockResolvedValue("https://accounts.google.test/consent");
  mocks.issueState.mockReturnValue({ state: "mock-state", nonce: "mock-nonce" });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const endpoints = [
  ["Stripe", "/api/stripe/connect/account-link", stripeStart.GET, stripeStart.POST, "stripe-connect", "https://connect.stripe.test/onboard"],
  ["Google", "/api/integrations/google/connect", googleStart.GET, googleStart.POST, "google-connect", "https://accounts.google.test/consent"],
] as const;

const unsafePostHeaders: Record<string, string>[] = [
  { origin: "https://untrusted.example" },
  { origin: "" },
  { "sec-fetch-site": "cross-site" },
  { "sec-fetch-user": "?0" },
  { "next-router-prefetch": "1" },
  { "next-router-segment-prefetch": "/_tree" },
  { "x-middleware-prefetch": "1" },
  { purpose: "prefetch" },
  { "sec-purpose": "prefetch;prerender" },
];

describe.each(endpoints)("%s integration start requires an explicit action", (_name, path, get, post, intent, destination) => {
  function request(headers: Record<string, string> = {}, submittedIntent = intent as string) {
    return new NextRequest(`https://staging-or-test.example${path}`, {
      method: "POST",
      headers: { origin: "https://staging-or-test.example", "sec-fetch-site": "same-origin", "sec-fetch-user": "?1", ...headers },
      body: new URLSearchParams({ intent: submittedIntent }),
    });
  }

  function expectNoEffects() {
    expect(mocks.stripeStart).not.toHaveBeenCalled();
    expect(mocks.googleStart).not.toHaveBeenCalled();
    expect(mocks.issueState).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  }

  it.each([
    ["page open", {}],
    ["browser refresh", { "cache-control": "max-age=0" }],
    ["navigation", { "sec-fetch-mode": "navigate" }],
    ["Next prefetch", { "next-router-prefetch": "1", purpose: "prefetch", rsc: "1" }],
  ])("does not start providers on GET during %s", async (_scenario, headers) => {
    const handler: (request: NextRequest) => Promise<Response> = get;
    const response = await handler(new NextRequest(`https://staging-or-test.example${path}`, { headers }));
    expect(mocks.stripeStart, "Stripe account/link calls").not.toHaveBeenCalled();
    expect(mocks.googleStart, "Google OAuth initiation calls").not.toHaveBeenCalled();
    expect(mocks.issueState, "OAuth state issuance calls").not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects HEAD/preload without starting any provider", async () => {
    const handler: (request: NextRequest) => Promise<Response> = get;
    expect((await handler(new NextRequest(`https://staging-or-test.example${path}`, { method: "HEAD" }))).status).toBe(405);
    expectNoEffects();
  });

  it.each(unsafePostHeaders)("rejects unsafe POST headers %j before authentication or effects", async (headers) => {
    const response = await post(request(headers));
    expect(response.status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it.each(["", "unknown", "other-provider"])("requires the correct explicit submit intent: %s", async (value) => {
    expect((await post(request({}, value))).status).toBe(403);
    expectNoEffects();
  });

  it("rejects non-form POST input", async () => {
    expect((await post(new NextRequest(`https://staging-or-test.example${path}`, {
      method: "POST", headers: { origin: "https://staging-or-test.example", "content-type": "application/json" }, body: JSON.stringify({ intent }),
    }))).status).toBe(403);
    expectNoEffects();
  });

  it("requires authentication even for a valid explicit form", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await post(request());
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expectNoEffects();
  });

  it("rejects other roles", async () => {
    mocks.user.mockResolvedValue({ id: "client-id", role: "CLIENT" });
    const response = await post(request());
    expect(new URL(response.headers.get("location")!).pathname).toBe("/403");
    expectNoEffects();
  });

  it("keeps the active/approved therapist permission gate", async () => {
    mocks.activeTherapist.mockRejectedValue(new ActionPermissionError("Not approved"));
    const response = await post(request());
    expect(new URL(response.headers.get("location")!).pathname).toBe("/therapist/onboarding");
    expectNoEffects();
  });

  it("preserves rate limiting without creating provider objects", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    const response = await post(request());
    expect(response.status).toBe(303);
    expect(mocks.stripeStart).not.toHaveBeenCalled();
    expect(mocks.googleStart).not.toHaveBeenCalled();
    expect(mocks.issueState).not.toHaveBeenCalled();
  });

  it("starts only the requested provider after an authorized explicit POST", async () => {
    const response = await post(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(destination);
    if (intent === "stripe-connect") {
      expect(mocks.stripeStart).toHaveBeenCalledExactlyOnceWith("therapist-user-id");
      expect(mocks.issueState).not.toHaveBeenCalled();
      expect(mocks.googleStart).not.toHaveBeenCalled();
    } else {
      expect(mocks.googleStart).toHaveBeenCalledExactlyOnceWith("therapist-user-id", "/therapist/payout-details", "mock-state");
      expect(mocks.issueState).toHaveBeenCalledTimes(1);
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(mocks.stripeStart).not.toHaveBeenCalled();
    }
  });
});
