import "server-only";

export class WixStagingIsolationError extends Error {
  readonly code = "WIX_STAGING_PROFILE_ISOLATED";

  constructor() {
    super("Wix synchronization is suppressed for this isolated staging profile.");
    this.name = "WixStagingIsolationError";
  }
}

// NODE_ENV and VERCEL_ENV are both production on the dedicated staging project.
// Require its identity, develop branch, staging URL and DB as independent gates.
export function isWixProfileIsolated(therapistProfileId: string): boolean {
  if (
    !process.env.WIX_STAGING_ISOLATED_PROFILE_ID ||
    process.env.WIX_STAGING_ISOLATED_PROFILE_ID !== therapistProfileId ||
    process.env.VERCEL !== "1" ||
    process.env.VERCEL_PROJECT_ID !== "prj_V23l6neyJoyjb46Lc5zXsEGGNMDU" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "develop" ||
    process.env.APP_URL !== "https://theraply-platform.vercel.app" ||
    process.env.WIX_CMS_ENVIRONMENT !== "staging"
  ) {
    return false;
  }

  try {
    const database = new URL(process.env.DATABASE_URL ?? "");
    if (
      database.pathname !== "/postgres" ||
      !database.hostname.endsWith(".prisma.io") ||
      (database.searchParams.get("schema") ?? "public") !== "public"
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function assertWixProfileNotIsolated(therapistProfileId: string) {
  if (isWixProfileIsolated(therapistProfileId)) {
    throw new WixStagingIsolationError();
  }
}
