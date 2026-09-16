import "server-only";
import Stripe from "stripe";
import { StripeConfigError } from "@/lib/stripe/stripe-config";

export type StripeWebhookChannel = "PLATFORM" | "CONNECTED_ACCOUNT";

export class StripeWebhookVerificationError extends Error {
  constructor() {
    super("Invalid Stripe webhook signature or body.");
    this.name = "StripeWebhookVerificationError";
  }
}

export const PLATFORM_WEBHOOK_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "transfer.created",
  "transfer.failed",
]);

export function isWebhookEventAllowed(channel: StripeWebhookChannel, type: string) {
  return channel === "PLATFORM"
    ? PLATFORM_WEBHOOK_EVENTS.has(type)
    : channel === "CONNECTED_ACCOUNT" && type === "account.updated";
}

export function verifyStripeWebhook(
  stripe: Pick<Stripe, "webhooks">,
  payload: string,
  signature: string,
  secrets: { webhookSecret: string; connectWebhookSecret?: string | null },
): { event: Stripe.Event; channel: StripeWebhookChannel } {
  if (secrets.connectWebhookSecret === secrets.webhookSecret) {
    throw new StripeConfigError("Stripe webhook destinations require distinct signing secrets.");
  }
  const destinations: [StripeWebhookChannel, string | null | undefined][] = [
    ["PLATFORM", secrets.webhookSecret],
    ["CONNECTED_ACCOUNT", secrets.connectWebhookSecret],
  ];
  for (const [channel, secret] of destinations) {
    if (!secret) continue;
    try {
      // The SDK verifies the untouched body before parsing JSON. Never infer source from JSON.
      const event = stripe.webhooks.constructEvent(payload, signature, secret);
      if (!event || typeof event.id !== "string" || !event.id ||
          typeof event.type !== "string" || typeof event.livemode !== "boolean" ||
          !event.data?.object || typeof event.data.object !== "object") {
        throw new StripeWebhookVerificationError();
      }
      return { event, channel };
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeSignatureVerificationError) &&
          !(error instanceof SyntaxError) && !(error instanceof StripeWebhookVerificationError)) {
        throw error;
      }
    }
  }
  throw new StripeWebhookVerificationError();
}
