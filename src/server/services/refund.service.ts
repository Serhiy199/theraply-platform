import "server-only";
import { PaymentStatus, PaymentTransferStatus } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe/stripe-config";
import { getStripeClient } from "@/lib/stripe/stripe";
import { CANCELLATION_POLICY_HOURS } from "@/lib/constants/bookings";
import { calculatePaymentBreakdown } from "@/lib/payment-breakdown";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import { markStripeChargeRefunded } from "@/server/services/payment-flow.service";

export type RefundTrigger =
  | "CLIENT_STANDARD_CANCELLATION"
  | "ADMIN_MANUAL_CANCELLATION"
  | "THERAPIST_CANCELLATION"
  | "SYSTEM_COMPENSATION";

export type RefundExecutionResult = {
  status: "refunded" | "skipped";
  reason:
    | "PAYMENT_NOT_FOUND"
    | "PAYMENT_NOT_PAID"
    | "ALREADY_REFUNDED"
    | "PAYMENT_INTENT_MISSING"
    | "LATE_CANCELLATION_POLICY"
    | "REFUNDED";
  refundId: string | null;
  refundedAmount: number | null;
};

export class RefundServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "STRIPE_NOT_CONFIGURED"
      | "REFUND_CREATE_FAILED"
      | "TRANSFER_RECONCILIATION_REQUIRED",
  ) {
    super(message);
    this.name = "RefundServiceError";
  }
}

function isStandardRefundWindow(startsAt: Date, now = new Date()) {
  return startsAt.getTime() - now.getTime() >= CANCELLATION_POLICY_HOURS * 60 * 60 * 1000;
}

async function logRefundSkipped(input: {
  actorUserId: string | null;
  bookingId: string;
  paymentId: string | null;
  trigger: RefundTrigger;
  reason: RefundExecutionResult["reason"];
}) {
  await createAuditLogEntryBestEffort({
    actorUserId: input.actorUserId,
    entityType: "Payment",
    entityId: input.paymentId ?? input.bookingId,
    action: "STRIPE_REFUND_SKIPPED",
    after: {
      bookingId: input.bookingId,
      trigger: input.trigger,
      reason: input.reason,
    },
  });
}

async function getBookingPaymentContextOrThrow(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      id: true,
      startsAt: true,
      clientId: true,
      therapistId: true,
      payment: {
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          stripeRefundId: true,
          refundedAmount: true,
          creditAppliedAmount: true,
          transferStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new RefundServiceError("Booking not found for refund flow.", "BOOKING_NOT_FOUND");
  }

  return booking;
}

export async function refundClientCancellationIfEligible(
  bookingId: string,
  actorUserId: string,
): Promise<RefundExecutionResult> {
  const booking = await getBookingPaymentContextOrThrow(bookingId);

  if (!booking.payment) {
    await logRefundSkipped({
      actorUserId,
      bookingId,
      paymentId: null,
      trigger: "CLIENT_STANDARD_CANCELLATION",
      reason: "PAYMENT_NOT_FOUND",
    });

    return {
      status: "skipped",
      reason: "PAYMENT_NOT_FOUND",
      refundId: null,
      refundedAmount: null,
    };
  }

  if (booking.payment.paymentStatus === PaymentStatus.REFUNDED) {
    await logRefundSkipped({
      actorUserId,
      bookingId,
      paymentId: booking.payment.id,
      trigger: "CLIENT_STANDARD_CANCELLATION",
      reason: "ALREADY_REFUNDED",
    });

    return {
      status: "skipped",
      reason: "ALREADY_REFUNDED",
      refundId: booking.payment.stripeRefundId,
      refundedAmount: booking.payment.refundedAmount,
    };
  }

  if (booking.payment.paymentStatus !== PaymentStatus.PAID) {
    await logRefundSkipped({
      actorUserId,
      bookingId,
      paymentId: booking.payment.id,
      trigger: "CLIENT_STANDARD_CANCELLATION",
      reason: "PAYMENT_NOT_PAID",
    });

    return {
      status: "skipped",
      reason: "PAYMENT_NOT_PAID",
      refundId: null,
      refundedAmount: null,
    };
  }

  if (!isStandardRefundWindow(booking.startsAt)) {
    await logRefundSkipped({
      actorUserId,
      bookingId,
      paymentId: booking.payment.id,
      trigger: "CLIENT_STANDARD_CANCELLATION",
      reason: "LATE_CANCELLATION_POLICY",
    });

    return {
      status: "skipped",
      reason: "LATE_CANCELLATION_POLICY",
      refundId: null,
      refundedAmount: null,
    };
  }

  return requestStripeRefundForBooking({
    bookingId,
    actorUserId,
    trigger: "CLIENT_STANDARD_CANCELLATION",
    businessReason: "Client cancelled more than 24 hours before the session.",
    stripeReason: "requested_by_customer",
  });
}

export async function refundPlatformCancellationIfEligible(input: {
  bookingId: string;
  actorUserId: string | null;
  trigger: Exclude<RefundTrigger, "CLIENT_STANDARD_CANCELLATION">;
  businessReason: string;
}): Promise<RefundExecutionResult> {
  const booking = await getBookingPaymentContextOrThrow(input.bookingId);

  if (!booking.payment) {
    await logRefundSkipped({
      actorUserId: input.actorUserId,
      bookingId: input.bookingId,
      paymentId: null,
      trigger: input.trigger,
      reason: "PAYMENT_NOT_FOUND",
    });

    return {
      status: "skipped",
      reason: "PAYMENT_NOT_FOUND",
      refundId: null,
      refundedAmount: null,
    };
  }

  if (booking.payment.paymentStatus === PaymentStatus.REFUNDED) {
    await logRefundSkipped({
      actorUserId: input.actorUserId,
      bookingId: input.bookingId,
      paymentId: booking.payment.id,
      trigger: input.trigger,
      reason: "ALREADY_REFUNDED",
    });

    return {
      status: "skipped",
      reason: "ALREADY_REFUNDED",
      refundId: booking.payment.stripeRefundId,
      refundedAmount: booking.payment.refundedAmount,
    };
  }

  if (booking.payment.paymentStatus !== PaymentStatus.PAID) {
    await logRefundSkipped({
      actorUserId: input.actorUserId,
      bookingId: input.bookingId,
      paymentId: booking.payment.id,
      trigger: input.trigger,
      reason: "PAYMENT_NOT_PAID",
    });

    return {
      status: "skipped",
      reason: "PAYMENT_NOT_PAID",
      refundId: null,
      refundedAmount: null,
    };
  }

  return requestStripeRefundForBooking({
    bookingId: input.bookingId,
    actorUserId: input.actorUserId,
    trigger: input.trigger,
    businessReason: input.businessReason,
    stripeReason: "requested_by_customer",
  });
}

async function requestStripeRefundForBooking(input: {
  bookingId: string;
  actorUserId: string | null;
  trigger: RefundTrigger;
  businessReason: string;
  stripeReason: Stripe.RefundCreateParams.Reason;
}): Promise<RefundExecutionResult> {
  const booking = await getBookingPaymentContextOrThrow(input.bookingId);
  const payment = booking.payment;

  if (!payment) {
    await logRefundSkipped({
      actorUserId: input.actorUserId,
      bookingId: input.bookingId,
      paymentId: null,
      trigger: input.trigger,
      reason: "PAYMENT_NOT_FOUND",
    });

    return {
      status: "skipped",
      reason: "PAYMENT_NOT_FOUND",
      refundId: null,
      refundedAmount: null,
    };
  }

  if (payment.paymentStatus === PaymentStatus.REFUNDED) {
    await logRefundSkipped({
      actorUserId: input.actorUserId,
      bookingId: input.bookingId,
      paymentId: payment.id,
      trigger: input.trigger,
      reason: "ALREADY_REFUNDED",
    });

    return {
      status: "skipped",
      reason: "ALREADY_REFUNDED",
      refundId: payment.stripeRefundId,
      refundedAmount: payment.refundedAmount,
    };
  }

  if (payment.paymentStatus !== PaymentStatus.PAID) {
    await logRefundSkipped({
      actorUserId: input.actorUserId,
      bookingId: input.bookingId,
      paymentId: payment.id,
      trigger: input.trigger,
      reason: "PAYMENT_NOT_PAID",
    });

    return {
      status: "skipped",
      reason: "PAYMENT_NOT_PAID",
      refundId: null,
      refundedAmount: null,
    };
  }

  if (payment.transferStatus === PaymentTransferStatus.TRANSFERRED) {
    await createAuditLogEntryBestEffort({
      actorUserId: input.actorUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "REFUND_TRANSFER_RECONCILIATION_REQUIRED",
      after: {
        bookingId: booking.id,
        trigger: input.trigger,
        transferStatus: payment.transferStatus,
      },
    });

    throw new RefundServiceError(
      "The therapist transfer is already complete, so this refund requires financial reconciliation.",
      "TRANSFER_RECONCILIATION_REQUIRED",
    );
  }

  const snapshot = calculatePaymentBreakdown({
    grossAmount: payment.amount,
    availableClientCredit: payment.creditAppliedAmount ?? 0,
  });

  if (!payment.stripePaymentIntentId) {
    if (snapshot.stripeChargeAmount === 0 && snapshot.creditAppliedAmount > 0) {
      await markStripeChargeRefunded(booking.id, {
        refundId: null,
        refundedAmount: 0,
        refundReason: input.businessReason,
      });

      await createAuditLogEntryBestEffort({
        actorUserId: input.actorUserId,
        entityType: "Payment",
        entityId: payment.id,
        action: "CLIENT_CREDIT_REFUND_COMPLETED",
        before: {
          paymentStatus: payment.paymentStatus,
        },
        after: {
          bookingId: booking.id,
          refundedCreditAmount: snapshot.creditAppliedAmount,
          trigger: input.trigger,
        },
      });

      return {
        status: "refunded",
        reason: "REFUNDED",
        refundId: null,
        refundedAmount: 0,
      };
    }

    throw new RefundServiceError(
      "Paid booking is missing Stripe payment intent metadata, so the refund could not be created automatically.",
      "REFUND_CREATE_FAILED",
    );
  }

  if (!isStripeConfigured()) {
    throw new RefundServiceError(
      "Stripe is not configured yet in this environment.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  const stripe = getStripeClient();

  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reason: input.stripeReason,
      metadata: {
        bookingId: booking.id,
        paymentId: payment.id,
        actorUserId: input.actorUserId ?? "",
        trigger: input.trigger,
      },
    });

    await markStripeChargeRefunded(booking.id, {
      refundId: refund.id,
      refundedAmount: refund.amount ?? payment.amount,
      refundReason: input.businessReason,
    });

    await createAuditLogEntryBestEffort({
      actorUserId: input.actorUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "STRIPE_REFUND_CREATED",
      before: {
        paymentStatus: payment.paymentStatus,
        stripeRefundId: payment.stripeRefundId,
      },
      after: {
        bookingId: booking.id,
        refundId: refund.id,
        refundedAmount: refund.amount ?? payment.amount,
        trigger: input.trigger,
        businessReason: input.businessReason,
      },
    });

    return {
      status: "refunded",
      reason: "REFUNDED",
      refundId: refund.id,
      refundedAmount: refund.amount ?? payment.amount,
    };
  } catch (error) {
    logDiagnosticEvent("refund-service", "Unable to create Stripe refund.", {
      bookingId: booking.id,
      paymentId: payment.id,
      trigger: input.trigger,
      error: error instanceof Error ? error.message : String(error),
    });

    await createAuditLogEntryBestEffort({
      actorUserId: input.actorUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "STRIPE_REFUND_CREATE_FAILED",
      after: {
        bookingId: booking.id,
        trigger: input.trigger,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw new RefundServiceError(
      error instanceof Error ? error.message : "Unable to create Stripe refund.",
      "REFUND_CREATE_FAILED",
    );
  }
}
