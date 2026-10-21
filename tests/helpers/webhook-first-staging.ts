import { vi } from "vitest";

export const WEBHOOK_FIRST_BOOKING_ID = "cwebhookfirsttest00000001";

export function enableWebhookFirstStagingGuard(bookingId = WEBHOOK_FIRST_BOOKING_ID) {
  vi.stubEnv("STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", bookingId);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_placeholder");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_unit_placeholder");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_V23l6neyJoyjb46Lc5zXsEGGNMDU");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("APP_URL", "https://theraply-platform.vercel.app");
  vi.stubEnv("DATABASE_URL", "postgresql://unit:placeholder@staging.prisma.io/postgres?schema=public");
}
