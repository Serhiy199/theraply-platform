import "server-only";

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  apiVersion: "2026-04-22.dahlia";
  currency: "gbp";
};

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

function readOptionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

function readRequiredEnv(name: string) {
  const value = readOptionalEnv(name);

  if (!value) {
    throw new StripeConfigError(`${name} is required for Stripe integration.`);
  }

  return value;
}

export function isStripeConfigured() {
  return Boolean(
    readOptionalEnv("STRIPE_SECRET_KEY") &&
      readOptionalEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") &&
      readOptionalEnv("STRIPE_WEBHOOK_SECRET"),
  );
}

export function getStripeConfig(): StripeConfig {
  return {
    secretKey: readRequiredEnv("STRIPE_SECRET_KEY"),
    publishableKey: readRequiredEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: readRequiredEnv("STRIPE_WEBHOOK_SECRET"),
    apiVersion: "2026-04-22.dahlia",
    currency: "gbp",
  };
}

export function getStripePublishableKey() {
  return readRequiredEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}
