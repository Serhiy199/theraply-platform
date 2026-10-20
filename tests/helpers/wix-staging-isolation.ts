import { vi } from "vitest";

export function enableWixStagingIsolation(profileId: string) {
  vi.stubEnv("WIX_STAGING_ISOLATED_PROFILE_ID", profileId);
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_V23l6neyJoyjb46Lc5zXsEGGNMDU");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop");
  vi.stubEnv("APP_URL", "https://theraply-platform.vercel.app");
  vi.stubEnv("WIX_CMS_ENVIRONMENT", "staging");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@staging.prisma.io/postgres?schema=public");
}
