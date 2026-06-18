import "server-only";
import Stripe from "stripe";
import { getStripeConfig } from "@/lib/stripe/stripe-config";

declare global {
  var stripeClientSingleton: Stripe | undefined;
}

export function createStripeClient() {
  const config = getStripeConfig();

  return new Stripe(config.secretKey, {
    apiVersion: config.apiVersion,
  });
}

export function getStripeClient() {
  if (!globalThis.stripeClientSingleton) {
    globalThis.stripeClientSingleton = createStripeClient();
  }

  return globalThis.stripeClientSingleton;
}
