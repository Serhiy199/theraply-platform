import { afterEach, describe, expect, it, vi } from "vitest";
import { assertWixProfileNotIsolated, WixStagingIsolationError } from "@/lib/wix/wix-staging-isolation";
import { enableWixStagingIsolation } from "../helpers/wix-staging-isolation";

afterEach(() => vi.unstubAllEnvs());

describe("Wix staging profile isolation", () => {
  it("suppresses only the configured profile in the verified staging context", () => {
    enableWixStagingIsolation("isolated-profile");
    expect(() => assertWixProfileNotIsolated("isolated-profile")).toThrow(WixStagingIsolationError);
    expect(() => assertWixProfileNotIsolated("existing-therapist")).not.toThrow();
  });

  it.each([
    ["WIX_STAGING_ISOLATED_PROFILE_ID", ""],
    ["VERCEL", ""],
    ["VERCEL_PROJECT_ID", "other-project"],
    ["VERCEL_GIT_COMMIT_REF", "main"],
    ["APP_URL", "https://platform.theraply.online"],
    ["WIX_CMS_ENVIRONMENT", "production"],
    ["DATABASE_URL", "postgresql://test:test@localhost/theraply_db"],
    ["DATABASE_URL", "postgresql://test:test@staging.prisma.io/postgres?schema=other"],
    ["DATABASE_URL", "postgresql://test:test@untrusted.invalid/postgres"],
    ["DATABASE_URL", "invalid"],
  ])("does not disable normal sync when %s is %s", (key, value) => {
    enableWixStagingIsolation("isolated-profile");
    vi.stubEnv(key, value);
    expect(() => assertWixProfileNotIsolated("isolated-profile")).not.toThrow();
  });
});
