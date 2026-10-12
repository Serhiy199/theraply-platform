import "server-only";
import Stripe from "stripe";
import { StripeConfigError } from "@/lib/stripe/stripe-config";

export type StripeWebhookChannel = "PLATFORM" | "CONNECTED_ACCOUNT";
export type StripeAccountThinNotification = Extract<Stripe.V2.Core.EventNotification, { type: "v2.core.account.updated" }>;
export type VerifiedStripeWebhook =
  | { kind: "SNAPSHOT"; event: Stripe.Event; channel: StripeWebhookChannel }
  | { kind: "CONNECT_V2_THIN"; event: StripeAccountThinNotification; channel: "CONNECTED_ACCOUNT" };

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

function validateThinPayload(value: unknown) {
  if (!value || typeof value !== "object") throw new StripeWebhookVerificationError();
  const raw = value as Record<string, unknown>;
  const related = raw.related_object as Record<string, unknown> | null | undefined;
  if (raw.object !== "v2.core.event" || raw.type !== "v2.core.account.updated" ||
      typeof raw.id !== "string" || !/^evt_[A-Za-z0-9_]+$/.test(raw.id) ||
      typeof raw.livemode !== "boolean" || typeof raw.created !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(raw.created) || !Number.isFinite(Date.parse(raw.created)) ||
      (raw.context != null && (typeof raw.context !== "string" ||
        !/^[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*$/.test(raw.context))) ||
      !related || related.type !== "v2.core.account" || typeof related.id !== "string" ||
      !/^acct_[A-Za-z0-9_]+$/.test(related.id) || related.url !== `/v2/core/accounts/${related.id}`) {
    throw new StripeWebhookVerificationError();
  }
}

export function verifyStripeWebhook(
  stripe: Pick<Stripe, "webhooks" | "parseEventNotification">,
  payload: string,
  signature: string,
  secrets: { webhookSecret: string; connectWebhookSecret?: string | null },
): VerifiedStripeWebhook {
  if (secrets.connectWebhookSecret === secrets.webhookSecret) {
    throw new StripeConfigError("Stripe webhook destinations require distinct signing secrets.");
  }
  if (!stripe.webhooks.signature) throw new StripeConfigError("Stripe signature verifier is unavailable.");
  const destinations: [StripeWebhookChannel, string | null | undefined][] = [
    ["PLATFORM", secrets.webhookSecret],
    ["CONNECTED_ACCOUNT", secrets.connectWebhookSecret],
  ];
  for (const [channel, secret] of destinations) {
    if (!secret) continue;
    try {
      // Verify source before using any payload field to select the SDK parser.
      stripe.webhooks.signature.verifyHeader(payload, signature, secret, stripe.webhooks.DEFAULT_TOLERANCE);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) continue;
      throw error;
    }
    try {
      const raw: unknown = JSON.parse(payload);
      if (raw && typeof raw === "object" && "object" in raw && raw.object === "v2.core.event") {
        if (channel !== "CONNECTED_ACCOUNT") throw new StripeWebhookVerificationError();
        validateThinPayload(raw);
        const event = stripe.parseEventNotification(payload, signature, secret);
        if (event.type !== "v2.core.account.updated") throw new StripeWebhookVerificationError();
        return { kind: "CONNECT_V2_THIN", event, channel };
      }
      const event = stripe.webhooks.constructEvent(payload, signature, secret);
      if (!event || typeof event.id !== "string" || !event.id ||
          typeof event.type !== "string" || event.type.startsWith("v2.") || typeof event.livemode !== "boolean" ||
          !event.data?.object || typeof event.data.object !== "object") {
        throw new StripeWebhookVerificationError();
      }
      return { kind: "SNAPSHOT", event, channel };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError ||
          error instanceof SyntaxError || error instanceof StripeWebhookVerificationError) {
        throw new StripeWebhookVerificationError();
      }
      throw error;
    }
  }
  throw new StripeWebhookVerificationError();
}
