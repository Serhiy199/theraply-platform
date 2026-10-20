import "server-only";
import Stripe from "stripe";
import { StripeConfigError } from "@/lib/stripe/stripe-config";

export type StripeWebhookChannel = "PLATFORM" | "CONNECTED_ACCOUNT";
const ACCOUNT_THIN_EVENT_INCLUDES = {
  "v2.core.account.updated": null,
  "v2.core.account[identity].updated": "identity",
  "v2.core.account[requirements].updated": "requirements",
  "v2.core.account[configuration.recipient].capability_status_updated": "configuration.recipient",
  "v2.core.account[configuration.merchant].capability_status_updated": "configuration.merchant",
} as const;
type StripeAccountThinEventType = keyof typeof ACCOUNT_THIN_EVENT_INCLUDES;
export type StripeAccountThinNotification = Extract<Stripe.V2.Core.EventNotification, { type: StripeAccountThinEventType }>;
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

function isAccountThinEventType(type: unknown): type is StripeAccountThinEventType {
  return typeof type === "string" && Object.hasOwn(ACCOUNT_THIN_EVENT_INCLUDES, type);
}

function isAccountThinNotification(event: Stripe.V2.Core.EventNotification): event is StripeAccountThinNotification {
  return isAccountThinEventType(event.type);
}

function isAccountRelatedUrl(url: unknown, accountId: string, type: StripeAccountThinEventType) {
  const path = `/v2/core/accounts/${accountId}`;
  const include = ACCOUNT_THIN_EVENT_INCLUDES[type];
  // Validate the event-specific Stripe URL, but retrieve by ID, never by this URL.
  return url === path || (include !== null && url === `${path}?include=${include}`);
}

function validateThinPayload(value: unknown) {
  if (!value || typeof value !== "object") throw new StripeWebhookVerificationError();
  const raw = value as Record<string, unknown>;
  const related = raw.related_object as Record<string, unknown> | null | undefined;
  if (raw.object !== "v2.core.event" || !isAccountThinEventType(raw.type) ||
      typeof raw.id !== "string" || !/^evt_[A-Za-z0-9_]+$/.test(raw.id) ||
      typeof raw.livemode !== "boolean" || typeof raw.created !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(raw.created) || !Number.isFinite(Date.parse(raw.created)) ||
      (raw.context != null && (typeof raw.context !== "string" ||
        !/^[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*$/.test(raw.context))) ||
      !related || related.type !== "v2.core.account" || typeof related.id !== "string" ||
      !/^acct_[A-Za-z0-9_]+$/.test(related.id) || !isAccountRelatedUrl(related.url, related.id, raw.type)) {
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
        if (!isAccountThinNotification(event)) throw new StripeWebhookVerificationError();
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
