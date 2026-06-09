import Stripe from "stripe";
import { PaymentTransferStatus, StripeConnectOnboardingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  markStripeChargeRefunded,
  markStripeCheckoutSessionCompleted,
  markStripeCheckoutSessionExpired,
  markStripePaymentIntentSucceeded,
  markStripePaymentIntentFailed,
  PaymentFlowServiceError,
} from "@/server/services/payment-flow.service";

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
    | Stripe.Charge
    | Stripe.Transfer,
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

function getPaymentIntentChargeId(paymentIntent: Stripe.PaymentIntent) {
  const latestCharge = paymentIntent.latest_charge;

  if (!latestCharge) {
    return null;
  }

  return typeof latestCharge === "string" ? latestCharge : latestCharge.id;
}

function getAccountOnboardingStatus(account: Stripe.Account) {
  if (account.charges_enabled && account.payouts_enabled && account.details_submitted) {
    return StripeConnectOnboardingStatus.READY;
  }

  if (account.requirements?.disabled_reason) {
    return StripeConnectOnboardingStatus.DISABLED;
  }

  if (account.details_submitted) {
    return StripeConnectOnboardingStatus.RESTRICTED;
  }

  return StripeConnectOnboardingStatus.ACCOUNT_CREATED;
}

function getAccountRequirementsDue(account: Stripe.Account) {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const eventuallyDue = account.requirements?.eventually_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];

  if (!currentlyDue.length && !eventuallyDue.length && !pastDue.length) {
    return undefined;
  }

  return {
    currentlyDue,
    eventuallyDue,
    pastDue,
  };
}

async function reserveWebhookEvent(event: Stripe.Event) {
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        id: event.id,
        eventType: event.type,
      },
    });
    return true;
  } catch {
    await createAuditLogEntryBestEffort({
      entityType: "StripeWebhook",
      entityId: event.id,
      action: "STRIPE_WEBHOOK_EVENT_DUPLICATE_SKIPPED",
      after: {
        eventType: event.type,
      },
    });
    return false;
  }
}

async function releaseWebhookEventReservation(event: Stripe.Event) {
  await prisma.stripeWebhookEvent.delete({
    where: {
      id: event.id,
    },
  }).catch(() => undefined);
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
  const payment = await markStripeCheckoutSessionCompleted(bookingId, {
    checkoutSessionId: session.id,
    paymentIntentId,
    amount: amountTotal,
    currency,
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.paymentId,
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
  const payment = await markStripePaymentIntentFailed(bookingId, {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency ?? "gbp",
    failedReason,
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.paymentId,
    action: "STRIPE_PAYMENT_INTENT_FAILED",
    after: {
      bookingId,
      paymentIntentId: paymentIntent.id,
      reason: failedReason,
      status: payment.paymentStatus,
    },
  });
}

async function markPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = getEventBookingId(paymentIntent);

  if (!bookingId) {
    throw new StripeWebhookServiceError(
      "Stripe payment_intent.succeeded event is missing booking metadata.",
      "BOOKING_REFERENCE_MISSING",
    );
  }

  const payment = await markStripePaymentIntentSucceeded(bookingId, {
    paymentIntentId: paymentIntent.id,
    chargeId: getPaymentIntentChargeId(paymentIntent),
    amount: paymentIntent.amount_received || paymentIntent.amount,
    currency: paymentIntent.currency ?? "gbp",
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.paymentId,
    action: "STRIPE_PAYMENT_INTENT_SUCCEEDED",
    after: {
      bookingId,
      paymentIntentId: paymentIntent.id,
      chargeId: getPaymentIntentChargeId(paymentIntent),
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

  const failedReason = "Stripe Checkout session expired before payment completion.";
  const payment = await markStripeCheckoutSessionExpired(bookingId, {
    checkoutSessionId: session.id,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "gbp",
    checkoutExpiresAt:
      typeof session.expires_at === "number"
        ? new Date(session.expires_at * 1000)
        : null,
    failedReason,
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.paymentId,
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

  const latestRefund = charge.refunds?.data?.[0] ?? null;
  const payment = await markStripeChargeRefunded(bookingId, {
    refundId: latestRefund?.id ?? null,
    refundedAmount: charge.amount_refunded || charge.amount || null,
    refundReason: latestRefund?.reason?.trim() || "Stripe refund processed.",
  });

  await createAuditLogEntryBestEffort({
    entityType: "Payment",
    entityId: payment.paymentId,
    action: "STRIPE_CHARGE_REFUNDED",
    after: {
      bookingId,
      chargeId: charge.id,
      refundId: latestRefund?.id ?? null,
      refundedAmount: charge.amount_refunded || charge.amount || null,
    },
  });
}

async function syncAccountUpdated(account: Stripe.Account) {
  const updated = await prisma.therapistProfile.updateMany({
    where: {
      stripeAccountId: account.id,
    },
    data: {
      stripeOnboardingStatus: getAccountOnboardingStatus(account),
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeDetailsSubmitted: account.details_submitted,
      stripeOnboardingCompletedAt:
        account.charges_enabled && account.payouts_enabled && account.details_submitted
          ? new Date()
          : undefined,
      stripeAccountSyncedAt: new Date(),
      stripeRequirementsDue: getAccountRequirementsDue(account),
      stripeDisabledReason: account.requirements?.disabled_reason ?? null,
    },
  });

  await createAuditLogEntryBestEffort({
    entityType: "TherapistProfile",
    entityId: account.id,
    action: "STRIPE_CONNECT_ACCOUNT_UPDATED",
    after: {
      stripeAccountId: account.id,
      matchedProfiles: updated.count,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    },
  });
}

async function markTransferCreated(transfer: Stripe.Transfer) {
  const paymentId = transfer.metadata?.paymentId?.trim() || null;

  if (!paymentId) {
    return;
  }

  await prisma.payment.update({
    where: {
      id: paymentId,
    },
    data: {
      stripeTransferId: transfer.id,
      transferStatus: PaymentTransferStatus.TRANSFERRED,
      transferredAt: new Date(),
      transferFailureReason: null,
      transferFailedAt: null,
    },
  });
}

async function markTransferFailed(transfer: Stripe.Transfer) {
  const paymentId = transfer.metadata?.paymentId?.trim() || null;

  if (!paymentId) {
    return;
  }

  await prisma.payment.update({
    where: {
      id: paymentId,
    },
    data: {
      stripeTransferId: transfer.id,
      transferStatus: PaymentTransferStatus.FAILED,
      transferFailedAt: new Date(),
      transferFailureReason: "Stripe reported that the transfer failed.",
    },
  });
}

export async function processStripeWebhookEvent(event: Stripe.Event) {
  const reserved = await reserveWebhookEvent(event);

  if (!reserved) {
    return;
  }

  try {
  switch (event.type as string) {
    case "checkout.session.completed":
      await markCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "payment_intent.succeeded":
      await markPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
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
    case "account.updated":
      await syncAccountUpdated(event.data.object as Stripe.Account);
      return;
    case "transfer.created":
      await markTransferCreated(event.data.object as Stripe.Transfer);
      return;
    case "transfer.failed":
      await markTransferFailed(event.data.object as Stripe.Transfer);
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
  } catch (error) {
    await releaseWebhookEventReservation(event);
    throw error;
  }
}

export async function processStripeWebhookEventBestEffort(event: Stripe.Event) {
  try {
    await processStripeWebhookEvent(event);
  } catch (error) {
    if (
      error instanceof PaymentFlowServiceError &&
      error.code === "PAYMENT_RECORD_NOT_FOUND"
    ) {
      throw new StripeWebhookServiceError(error.message, "PAYMENT_NOT_FOUND");
    }

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
