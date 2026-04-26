import { PaymentStatus } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";

export class StripeWebhookServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_REFERENCE_MISSING"
      | "PAYMENT_NOT_FOUND"
      | "UNSUPPORTED_EVENT",
  ) {
    super(message);
    this.name = "StripeWebhookServiceError";
  }
}

function getEventBookingId(
  object:
    | Stripe.Checkout.Session
    | Stripe.PaymentIntent
    | Stripe.Charge,
) {
  const bookingIdFromMetadata = object.metadata?.bookingId?.trim();

  if (bookingIdFromMetadata) {
    return bookingIdFromMetadata;
  }

  if ("client_reference_id" in object && typeof object.client_reference_id === "string") {
    const clientReferenceBookingId = object.client_reference_id.trim();
    if (clientReferenceBookingId) {
      return clientReferenceBookingId;
    }
  }

  return null;
}

function getFailedReason(paymentIntent: Stripe.PaymentIntent) {
  return (
    paymentIntent.last_payment_error?.message?.trim() ||
    paymentIntent.cancellation_reason?.trim() ||
    "Payment failed in Stripe."
  );
}

async function markCheckoutCompleted(session: Stripe.Checkout.Session) {
  const bookingId = getEventBookingId(session);

  if (!bookingId) {
    throw new StripeWebhookServiceError(
      "Stripe checkout.session.completed event is missing booking metadata.",
      "BOOKING_REFERENCE_MISSING",
    );
  }

  const amountTotal = session.amount_total ?? 0;
  const currency = session.currency ?? "gbp";
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const paidAt = new Date();

  const payment = await prisma.payment.upsert({
    where: {
      bookingId,
    },
    update: {
      amount: amountTotal,
      currency,
      paymentStatus: PaymentStatus.PAID,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      paidAt,
      failedAt: null,
      refundedAt: null,
      failedReason: null,
    },
    create: {
      bookingId,
      amount: amountTotal,
      currency,
      paymentStatus: PaymentStatus.PAID,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      paidAt,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
      amount: true,
      currency: true,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      paidAt: true,
    },
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.id,
    action: "STRIPE_CHECKOUT_SESSION_COMPLETED",
    after: {
      bookingId,
      sessionId: session.id,
      paymentIntentId,
      amount: amountTotal,
      currency,
      status: payment.paymentStatus,
    },
  });
}

async function markPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = getEventBookingId(paymentIntent);

  if (!bookingId) {
    throw new StripeWebhookServiceError(
      "Stripe payment_intent.payment_failed event is missing booking metadata.",
      "BOOKING_REFERENCE_MISSING",
    );
  }

  const failedReason = getFailedReason(paymentIntent);
  const failedAt = new Date();

  const payment = await prisma.payment.upsert({
    where: {
      bookingId,
    },
    update: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency ?? "gbp",
      paymentStatus: PaymentStatus.FAILED,
      stripePaymentIntentId: paymentIntent.id,
      failedAt,
      failedReason,
    },
    create: {
      bookingId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency ?? "gbp",
      paymentStatus: PaymentStatus.FAILED,
      stripePaymentIntentId: paymentIntent.id,
      failedAt,
      failedReason,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.id,
    action: "STRIPE_PAYMENT_INTENT_FAILED",
    after: {
      bookingId,
      paymentIntentId: paymentIntent.id,
      reason: failedReason,
      status: payment.paymentStatus,
    },
  });
}

async function markCheckoutExpired(session: Stripe.Checkout.Session) {
  const bookingId = getEventBookingId(session);

  if (!bookingId) {
    throw new StripeWebhookServiceError(
      "Stripe checkout.session.expired event is missing booking metadata.",
      "BOOKING_REFERENCE_MISSING",
    );
  }

  const failedAt = new Date();
  const failedReason = "Stripe Checkout session expired before payment completion.";

  const payment = await prisma.payment.upsert({
    where: {
      bookingId,
    },
    update: {
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "gbp",
      paymentStatus: PaymentStatus.FAILED,
      stripeCheckoutSessionId: session.id,
      failedAt,
      failedReason,
      checkoutExpiresAt:
        typeof session.expires_at === "number"
          ? new Date(session.expires_at * 1000)
          : null,
    },
    create: {
      bookingId,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "gbp",
      paymentStatus: PaymentStatus.FAILED,
      stripeCheckoutSessionId: session.id,
      failedAt,
      failedReason,
      checkoutExpiresAt:
        typeof session.expires_at === "number"
          ? new Date(session.expires_at * 1000)
          : null,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.id,
    action: "STRIPE_CHECKOUT_SESSION_EXPIRED",
    after: {
      bookingId,
      sessionId: session.id,
      status: payment.paymentStatus,
    },
  });
}

async function markChargeRefunded(charge: Stripe.Charge) {
  const bookingId = getEventBookingId(charge);

  if (!bookingId) {
    throw new StripeWebhookServiceError(
      "Stripe charge.refunded event is missing booking metadata.",
      "BOOKING_REFERENCE_MISSING",
    );
  }

  const payment = await prisma.payment.findUnique({
    where: {
      bookingId,
    },
    select: {
      id: true,
    },
  });

  if (!payment) {
    throw new StripeWebhookServiceError(
      "Payment record was not found for Stripe refund event.",
      "PAYMENT_NOT_FOUND",
    );
  }

  const refundedAt = new Date();
  const latestRefund = charge.refunds?.data?.[0] ?? null;

  await prisma.payment.update({
    where: {
      id: payment.id,
    },
    data: {
      paymentStatus: PaymentStatus.REFUNDED,
      refundedAt,
      refundedAmount: charge.amount_refunded || charge.amount || null,
      stripeRefundId: latestRefund?.id ?? null,
      refundReason: latestRefund?.reason?.trim() || "Stripe refund processed.",
    },
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.id,
    action: "STRIPE_CHARGE_REFUNDED",
    after: {
      bookingId,
      chargeId: charge.id,
      refundId: latestRefund?.id ?? null,
      refundedAmount: charge.amount_refunded || charge.amount || null,
    },
  });
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await markCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "payment_intent.payment_failed":
      await markPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      return;
    case "checkout.session.expired":
      await markCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      return;
    case "charge.refunded":
      await markChargeRefunded(event.data.object as Stripe.Charge);
      return;
    default:
      await createAuditLogEntryBestEffort({
        entityType: "StripeWebhook",
        entityId: event.id,
        action: "STRIPE_WEBHOOK_EVENT_IGNORED",
        after: {
          eventType: event.type,
        },
      });
      throw new StripeWebhookServiceError(
        `Stripe event ${event.type} is not handled by this webhook service.`,
        "UNSUPPORTED_EVENT",
      );
  }
}

export async function processStripeWebhookEventBestEffort(event: Stripe.Event) {
  try {
    await processStripeWebhookEvent(event);
  } catch (error) {
    if (
      error instanceof StripeWebhookServiceError &&
      error.code === "UNSUPPORTED_EVENT"
    ) {
      return;
    }

    logDiagnosticEvent("stripe-webhook", "Unable to process Stripe webhook event.", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    });

    await createAuditLogEntryBestEffort({
      entityType: "StripeWebhook",
      entityId: event.id,
      action: "STRIPE_WEBHOOK_PROCESSING_FAILED",
      after: {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
