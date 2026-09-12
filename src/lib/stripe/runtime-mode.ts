import "server-only";

export type StripeRuntimeMode = "TEST" | "LIVE";

export class StripeIsolationError extends Error {
  constructor(public readonly code: "STRIPE_MODE_INVALID" | "STRIPE_MODE_MISMATCH" | "TEST_FIXTURE_FORBIDDEN" | "STRIPE_EVENT_MODE_MISMATCH" | "STRIPE_ACCOUNT_UNOWNED") {
    super(code);
    this.name = "StripeIsolationError";
  }
}

export function getStripeRuntimeMode(): StripeRuntimeMode {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const publicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  const mode = /^sk_test_.+/.test(secret) ? "TEST" : /^sk_live_.+/.test(secret) ? "LIVE" : null;
  if (!mode) throw new StripeIsolationError("STRIPE_MODE_INVALID");
  if (!publicKey.startsWith(mode === "LIVE" ? "pk_live_" : "pk_test_") || publicKey.length <= 8) {
    throw new StripeIsolationError("STRIPE_MODE_MISMATCH");
  }
  return mode;
}

export function assertStripeEventMode(livemode: boolean) {
  if (livemode !== (getStripeRuntimeMode() === "LIVE")) {
    throw new StripeIsolationError("STRIPE_EVENT_MODE_MISMATCH");
  }
}

export function isLiveStripeReadinessContext() {
  // Read-only pages may run before Stripe is configured; financial entry points are strict.
  return Boolean(process.env.STRIPE_SECRET_KEY && getStripeRuntimeMode() === "LIVE");
}
