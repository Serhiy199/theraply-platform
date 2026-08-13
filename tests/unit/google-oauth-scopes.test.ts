import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_CALENDAR_SCOPES,
  getGoogleOAuthScopeDiagnostics,
} from "@/lib/google/google-calendar-config";
import { buildGoogleOAuthConsentUrl } from "@/lib/google/google-oauth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Google Calendar OAuth scopes", () => {
  it("requests the exact intended scopes without duplicates", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv(
      "GOOGLE_CALENDAR_REDIRECT_URI",
      "https://staging.example/api/integrations/google/callback",
    );

    const consentUrl = new URL(
      buildGoogleOAuthConsentUrl({ therapistUserId: "therapist-user-id" }),
    );
    const scopes = consentUrl.searchParams.get("scope")?.split(" ") ?? [];

    expect(scopes).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(consentUrl.searchParams.get("access_type")).toBe("offline");
    expect(consentUrl.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("accepts Google's canonical userinfo aliases", () => {
    const diagnostics = getGoogleOAuthScopeDiagnostics(
      [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/calendar",
      ].join(" "),
    );

    expect(diagnostics.missingRequiredScopes).toEqual([]);
  });

  it("reports missing required scopes without exposing credentials", () => {
    const diagnostics = getGoogleOAuthScopeDiagnostics(
      "openid https://www.googleapis.com/auth/userinfo.email",
    );

    expect(diagnostics.requestedScopes).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(diagnostics.missingRequiredScopes).toEqual([
      "profile",
      "https://www.googleapis.com/auth/calendar",
    ]);
    expect(diagnostics).not.toHaveProperty("accessToken");
    expect(diagnostics).not.toHaveProperty("refreshToken");
  });
});
