import { afterEach, describe, expect, it, vi } from "vitest";
import { assertWixProfileNotIsolated, getWixProfileIsolationState, WixStagingIsolationError } from "@/lib/wix/wix-staging-isolation";
import { enableWixStagingIsolation, ISOLATED_PROFILE_ID } from "../helpers/wix-staging-isolation";

afterEach(() => vi.unstubAllEnvs());

describe("Wix staging profile isolation", () => {
  it("suppresses only the configured profile in the verified staging context", () => {
    enableWixStagingIsolation(ISOLATED_PROFILE_ID);
    expect(getWixProfileIsolationState(ISOLATED_PROFILE_ID).status).toBe("ISOLATED");
    expect(() => assertWixProfileNotIsolated(ISOLATED_PROFILE_ID)).toThrow(WixStagingIsolationError);
    expect(() => assertWixProfileNotIsolated("existing-therapist")).not.toThrow();
  });

  it.each([
    ["WIX_STAGING_ISOLATED_PROFILE_ID", ""],
    ["WIX_STAGING_ISOLATED_PROFILE_ID", "true"],
    ["WIX_STAGING_ISOLATED_PROFILE_ID", "unknown"],
    ["VERCEL", ""],
    ["VERCEL_PROJECT_ID", "other-project"],
    ["VERCEL_GIT_COMMIT_REF", "main"],
    ["APP_URL", "https://platform.theraply.online"],
    ["WIX_CMS_ENVIRONMENT", "production"],
    ["DATABASE_URL", "postgresql://test:test@localhost/theraply_db"],
    ["DATABASE_URL", "postgresql://test:test@staging.prisma.io/postgres?schema=other"],
    ["DATABASE_URL", "postgresql://test:test@untrusted.invalid/postgres"],
    ["DATABASE_URL", "invalid"],
  ])("blocks staging external writes when %s is %s", (key, value) => {
    enableWixStagingIsolation(ISOLATED_PROFILE_ID);
    vi.stubEnv(key, value);
    expect(getWixProfileIsolationState(ISOLATED_PROFILE_ID).status).toBe("BLOCKED_CONFIGURATION");
    expect(() => assertWixProfileNotIsolated(ISOLATED_PROFILE_ID)).toThrow(WixStagingIsolationError);
    expect(() => assertWixProfileNotIsolated("another-profile")).toThrow(WixStagingIsolationError);
  });

  it.each(["https://theraply-platform.vercel.app/", " https://theraply-platform.vercel.app\r\n"])("accepts only canonical root URL normalization and records the legacy mismatch: %s", (url) => {
    enableWixStagingIsolation(ISOLATED_PROFILE_ID);
    vi.stubEnv("APP_URL", url);
    expect(getWixProfileIsolationState(ISOLATED_PROFILE_ID)).toMatchObject({ status: "ISOLATED", failedChecks: [], legacyFailedChecks: ["APP_URL_EXACT"] });
  });

  it.each(["https://theraply-platform.vercel.app.evil.invalid", "https://theraply-platform.vercel.app/path", "http://theraply-platform.vercel.app", "https://theraply-platform.vercel.app?mode=staging"])("rejects a different origin or non-root app URL: %s", (url) => {
    enableWixStagingIsolation(ISOLATED_PROFILE_ID);
    vi.stubEnv("APP_URL", url);
    expect(getWixProfileIsolationState(ISOLATED_PROFILE_ID).failedChecks).toContain("APP_URL_CANONICAL");
  });

  it("retains normal production VPS behavior even if the isolation variable is copied", () => {
    enableWixStagingIsolation(ISOLATED_PROFILE_ID);
    vi.stubEnv("APP_URL", "https://platform.theraply.online");
    vi.stubEnv("WIX_CMS_ENVIRONMENT", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_PROJECT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/theraply_db");
    expect(getWixProfileIsolationState(ISOLATED_PROFILE_ID).status).toBe("NORMAL");
    expect(() => assertWixProfileNotIsolated(ISOLATED_PROFILE_ID)).not.toThrow();
  });
});
