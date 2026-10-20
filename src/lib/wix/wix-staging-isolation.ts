import "server-only";

export class WixStagingIsolationError extends Error {
  readonly code = "WIX_STAGING_PROFILE_ISOLATED";

  constructor(blockedChecks: string[] = []) {
    super(blockedChecks.length
      ? `Wix synchronization is blocked by staging configuration: ${blockedChecks.join(", ")}.`
      : "Wix synchronization is suppressed for this isolated staging profile.");
    this.name = "WixStagingIsolationError";
  }
}

export type WixProfileIsolationState = {
  status: "NORMAL" | "ISOLATED" | "BLOCKED_CONFIGURATION";
  configured: boolean;
  failedChecks: string[];
  legacyFailedChecks: string[];
};

const STAGING_PROJECT_ID = "prj_V23l6neyJoyjb46Lc5zXsEGGNMDU";
const STAGING_APP_URL = "https://theraply-platform.vercel.app";

function hasStagingAppUrl() {
  try {
    const url = new URL(process.env.APP_URL ?? "");
    return url.origin === STAGING_APP_URL && url.pathname === "/" &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}

// NODE_ENV/VERCEL_ENV are production on staging too. Never use them alone.
export function getWixProfileIsolationState(therapistProfileId: string): WixProfileIsolationState {
  const configuredId = process.env.WIX_STAGING_ISOLATED_PROFILE_ID ?? "";
  const stagingUrl = hasStagingAppUrl();
  const stagingIntent = process.env.WIX_CMS_ENVIRONMENT === "staging" ||
    process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID || stagingUrl;
  if (!stagingIntent) {
    return { status: "NORMAL", configured: Boolean(configuredId), failedChecks: [], legacyFailedChecks: [] };
  }

  let stagingDatabase = false;
  try {
    const database = new URL(process.env.DATABASE_URL ?? "");
    stagingDatabase = database.pathname === "/postgres" &&
      database.hostname.endsWith(".prisma.io") &&
      (database.searchParams.get("schema") ?? "public") === "public";
  } catch {
    // Invalid or missing staging DB configuration must block external writes.
  }

  const checks = {
    PROFILE_ID_CONFIG: /^c[a-z0-9]{24}$/.test(configuredId),
    VERCEL_RUNTIME: process.env.VERCEL === "1",
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID === STAGING_PROJECT_ID,
    DEVELOP_BRANCH: process.env.VERCEL_GIT_COMMIT_REF === "develop",
    APP_URL_CANONICAL: stagingUrl,
    CMS_ENVIRONMENT: process.env.WIX_CMS_ENVIRONMENT === "staging",
    STAGING_DATABASE: stagingDatabase,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const legacyFailedChecks = Object.entries({
    ...checks,
    PROFILE_ID_CONFIG: Boolean(configuredId),
    APP_URL_EXACT: process.env.APP_URL === STAGING_APP_URL,
  }).filter(([name, passed]) => name !== "APP_URL_CANONICAL" && !passed).map(([name]) => name);

  return {
    status: failedChecks.length ? "BLOCKED_CONFIGURATION" : configuredId === therapistProfileId ? "ISOLATED" : "NORMAL",
    configured: Boolean(configuredId),
    failedChecks,
    legacyFailedChecks,
  };
}

export function assertWixProfileNotIsolated(therapistProfileId: string) {
  const isolation = getWixProfileIsolationState(therapistProfileId);
  if (isolation.status !== "NORMAL") {
    throw new WixStagingIsolationError(isolation.failedChecks);
  }
}
