import { describe, expect, it } from "vitest";
import {
  buildAuthRouteWithCallback,
  getPostLoginRedirectForUser,
  resolveClientBookingCallbackUrl,
  resolveSafeInternalCallbackUrl,
} from "@/lib/auth/redirects";

describe("authentication intent redirects", () => {
  it("preserves canonical client booking paths and their query string", () => {
    expect(resolveClientBookingCallbackUrl("/client/book/therapist-1")).toBe(
      "/client/book/therapist-1",
    );
    expect(
      resolveClientBookingCallbackUrl(
        "/client/book/therapist-1?source=wix&campaign=summer",
      ),
    ).toBe("/client/book/therapist-1?source=wix&campaign=summer");
    expect(
      resolveClientBookingCallbackUrl(
        "%2Fclient%2Fbook%2Ftherapist-1%3Fsource%3Dwix",
      ),
    ).toBe("/client/book/therapist-1?source=wix");
  });

  it("rejects non-booking and unsafe callback targets", () => {
    for (const callbackUrl of [
      "https://evil.example/client/book/therapist-1",
      "//evil.example/client/book/therapist-1",
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "",
      "/client/book/new",
      "/client/dashboard",
      "/therapist/dashboard",
      "/client/book/therapist-1/extra",
      "/client\\book\\therapist-1",
      "%E0%A4%A",
    ]) {
      expect(resolveClientBookingCallbackUrl(callbackUrl)).toBeNull();
    }
  });

  it("falls back safely for external or malformed general callbacks", () => {
    expect(resolveSafeInternalCallbackUrl("https://evil.example/path")).toBe("/");
    expect(resolveSafeInternalCallbackUrl("//evil.example/path")).toBe("/");
    expect(resolveSafeInternalCallbackUrl("/client/dashboard")).toBe(
      "/client/dashboard",
    );
  });

  it("encodes nested callback query values without losing intent", () => {
    const authUrl = buildAuthRouteWithCallback(
      "/login",
      "/client/book/therapist-1?source=wix&campaign=summer",
    );
    const parsed = new URL(authUrl, "https://theraply.example");

    expect(parsed.pathname).toBe("/login");
    expect(parsed.searchParams.get("callbackUrl")).toBe(
      "/client/book/therapist-1?source=wix&campaign=summer",
    );

    const registerUrl = buildAuthRouteWithCallback(
      "/register",
      parsed.searchParams.get("callbackUrl"),
    );
    const loginUrl = buildAuthRouteWithCallback(
      "/login",
      new URL(registerUrl, "https://theraply.example").searchParams.get(
        "callbackUrl",
      ),
    );
    expect(
      new URL(loginUrl, "https://theraply.example").searchParams.get(
        "callbackUrl",
      ),
    ).toBe("/client/book/therapist-1?source=wix&campaign=summer");
  });

  it("allows callbacks only within the authenticated user's role area", () => {
    expect(
      getPostLoginRedirectForUser(
        { role: "CLIENT", emailVerified: true },
        "/client/book/therapist-1",
      ),
    ).toBe("/client/book/therapist-1");
    expect(
      getPostLoginRedirectForUser(
        { role: "THERAPIST", emailVerified: true, therapistApprovalStatus: "APPROVED" },
        "/client/book/therapist-1",
      ),
    ).toBe("/therapist/dashboard");
    expect(
      getPostLoginRedirectForUser(
        { role: "ADMIN", emailVerified: true },
        "/client/book/therapist-1",
      ),
    ).toBe("/admin/dashboard");
  });

  it("uses existing role defaults when callback is absent or invalid", () => {
    expect(
      getPostLoginRedirectForUser({ role: "CLIENT", emailVerified: true }),
    ).toBe("/client/dashboard");
    expect(
      getPostLoginRedirectForUser(
        { role: "CLIENT", emailVerified: true },
        "https://evil.example/redirect",
      ),
    ).toBe("/client/dashboard");
  });

  it("keeps incomplete therapists on onboarding regardless of callback", () => {
    expect(
      getPostLoginRedirectForUser(
        { role: "THERAPIST", emailVerified: false, therapistApprovalStatus: "PENDING" },
        "/therapist/dashboard",
      ),
    ).toBe("/therapist/onboarding");
  });
});
