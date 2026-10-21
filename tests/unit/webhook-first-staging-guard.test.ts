import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldSkipStagingSuccessReconciliation } from "@/lib/stripe/webhook-first-staging-guard";
import { enableWebhookFirstStagingGuard, WEBHOOK_FIRST_BOOKING_ID } from "../helpers/webhook-first-staging";

afterEach(() => vi.unstubAllEnvs());

describe("temporary staging webhook-first guard", () => {
  it("selects exactly one booking even though Vercel labels staging as production", () => {
    enableWebhookFirstStagingGuard();
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldSkipStagingSuccessReconciliation(WEBHOOK_FIRST_BOOKING_ID)).toBe(true);
    expect(shouldSkipStagingSuccessReconciliation("canotherbooking00000000001")).toBe(false);
  });

  it.each([
    ["STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", ""],
    ["STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", "*"],
    ["STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", "true"],
    ["STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", `${WEBHOOK_FIRST_BOOKING_ID},other`],
    ["STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", ` ${WEBHOOK_FIRST_BOOKING_ID}`],
    ["VERCEL", ""],
    ["VERCEL_PROJECT_ID", ""],
    ["VERCEL_PROJECT_ID", "other-project"],
    ["VERCEL_GIT_COMMIT_REF", "main"],
    ["VERCEL_ENV", "preview"],
    ["APP_URL", ""],
    ["APP_URL", "https://platform.theraply.online"],
    ["APP_URL", "https://theraply-platform.vercel.app.evil.invalid"],
    ["APP_URL", "https://theraply-platform.vercel.app/path"],
    ["APP_URL", "https://theraply-platform.vercel.app?guard=1"],
    ["APP_URL", "https://theraply-platform.vercel.app#guard"],
    ["APP_URL", "https://user@theraply-platform.vercel.app"],
    ["APP_URL", "http://theraply-platform.vercel.app"],
    ["DATABASE_URL", ""],
    ["DATABASE_URL", "invalid"],
    ["DATABASE_URL", "postgresql://unit:placeholder@localhost/theraply"],
    ["DATABASE_URL", "postgresql://unit:placeholder@staging.prisma.io/production"],
    ["DATABASE_URL", "postgresql://unit:placeholder@staging.prisma.io/postgres?schema=other"],
    ["DATABASE_URL", "postgresql://unit:placeholder@evilprisma.io/postgres"],
    ["DATABASE_URL", "https://staging.prisma.io/postgres"],
    ["STRIPE_SECRET_KEY", ""],
    ["STRIPE_SECRET_KEY", "sk_live_unit_placeholder"],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_unit_placeholder"],
  ])("retains normal reconciliation when %s is invalid (%s)", (name, value) => {
    enableWebhookFirstStagingGuard();
    vi.stubEnv(name, value);
    expect(shouldSkipStagingSuccessReconciliation(WEBHOOK_FIRST_BOOKING_ID)).toBe(false);
  });

  it("cannot activate on LIVE even with every staging marker copied", () => {
    enableWebhookFirstStagingGuard();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit_placeholder");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_unit_placeholder");
    expect(shouldSkipStagingSuccessReconciliation(WEBHOOK_FIRST_BOOKING_ID)).toBe(false);
  });

  it("cannot activate on the production VPS even with TEST keys and a copied booking ID", () => {
    enableWebhookFirstStagingGuard();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_PROJECT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("APP_URL", "https://platform.theraply.online");
    vi.stubEnv("DATABASE_URL", "postgresql://unit:placeholder@localhost/theraply");
    expect(shouldSkipStagingSuccessReconciliation(WEBHOOK_FIRST_BOOKING_ID)).toBe(false);
  });
});
