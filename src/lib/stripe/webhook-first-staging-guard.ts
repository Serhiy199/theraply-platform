import "server-only";
import { getStripeRuntimeMode } from "@/lib/stripe/runtime-mode";

const STAGING_PROJECT_ID = "prj_V23l6neyJoyjb46Lc5zXsEGGNMDU";
const STAGING_APP_URL = "https://theraply-platform.vercel.app";

// Temporary acceptance guard. Neither request parameters nor NODE_ENV authorize it.
export function shouldSkipStagingSuccessReconciliation(bookingId: string) {
  const configuredId = process.env.STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID ?? "";
  if (!/^c[a-z0-9]{24}$/.test(configuredId) || configuredId !== bookingId) return false;

  if (
    process.env.VERCEL !== "1" ||
    process.env.VERCEL_PROJECT_ID !== STAGING_PROJECT_ID ||
    process.env.VERCEL_GIT_COMMIT_REF !== "develop" ||
    process.env.VERCEL_ENV !== "production"
  ) return false;

  try {
    if (getStripeRuntimeMode() !== "TEST") return false;
    const app = new URL(process.env.APP_URL ?? "");
    const database = new URL(process.env.DATABASE_URL ?? "");
    return app.origin === STAGING_APP_URL && app.pathname === "/" &&
      !app.search && !app.hash && !app.username && !app.password &&
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      database.hostname.endsWith(".prisma.io") && database.pathname === "/postgres" &&
      (database.searchParams.get("schema") ?? "public") === "public";
  } catch {
    return false;
  }
}
