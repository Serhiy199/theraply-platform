import { BookingStatus, PaymentStatus, PaymentTransferStatus, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_CURRENCY,
  PAYMENT_ELIGIBILITY_MESSAGES,
  PAYMENT_POLICY_HOURS_BEFORE_SESSION,
} from "@/lib/constants/payments";
import { calculatePaymentBreakdown } from "@/lib/payment-breakdown";
import type { PromoCodePreview } from "@/lib/contracts/payments";
import {
  assertPromoCodeUsable,
  PromoCodeValidationError,
  resolvePaymentFinancialSnapshot,
  validatePromoCodeFormat,
  validatePromoDiscountPercent,
} from "@/lib/promo-code";
import { isStripeConfigured } from "@/lib/stripe/stripe-config";
import { getStripeClient } from "@/lib/stripe/stripe";
import { DEFAULT_APP_TIME_ZONE } from "@/lib/time-zone";
import { formatAppDateTime } from "@/lib/utils/date-time";
import {
  acquireFinancialTransactionLock,
  applyClientCreditToPaymentInTransaction,
  issueClientCreditInTransaction,
  reverseClientCreditApplication,
} from "@/server/services/client-credit.service";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
import {
  sendPaymentFailedEmailBestEffort,
  sendPaymentSuccessfulEmailBestEffort,
} from "@/server/services/transactional-email-events.service";
import { isStripeConnectReady } from "@/server/services/stripe-connect.service";

const paymentEligibilitySelect = {
  id: true,
  clientId: true,
  bookingStatus: true,
  startsAt: true,
  endsAt: true,
  paymentDueBy: true,
  therapist: {
    select: {
      therapistProfile: {
        select: {
          sessionPricePence: true,
          stripeAccountId: true,
          stripeOnboardingStatus: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
          stripeDetailsSubmitted: true,
        },
      },
    },
  },
  client: {
    select: {
      clientCreditBalance: {
        select: {
          balance: true,
          currency: true,
        },
      },
    },
  },
  payment: {
    select: {
      id: true,
      paymentStatus: true,
      paidAt: true,
      failedAt: true,
      refundedAt: true,
      checkoutExpiresAt: true,
      creditAppliedAmount: true,
      promoCodeSnapshot: true,
      promoDiscountPercent: true,
      promoDiscountAmount: true,
      clientPayableAmount: true,
      stripeChargeAmount: true,
    },
  },
} satisfies Prisma.BookingSelect;

type PaymentEligibilityBooking = Prisma.BookingGetPayload<{
  select: typeof paymentEligibilitySelect;
}>;

export type PaymentEligibilityCode =
  | "ELIGIBLE"
  | "BOOKING_NOT_CONFIRMED"
  | "BOOKING_CLOSED"
  | "MISSING_THERAPIST_PRICE"
  | "THERAPIST_STRIPE_NOT_READY"
  | "ALREADY_PAID"
  | "PAYMENT_PENDING"
  | "REFUNDED"
  | "PAYMENT_DEADLINE_PASSED";

export type PaymentEligibility = {
  canPay: boolean;
  code: PaymentEligibilityCode;
  message: string;
  amount: number | null;
  projectedStripeChargeAmount: number | null;
  projectedCreditAppliedAmount: number;
  availableCreditAmount: number;
  currency: string;
  paymentDueBy: Date;
  therapistSessionPricePence: number | null;
  paymentStatus: PaymentStatus | null;
};

export class PaymentFlowServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "PAYMENT_NOT_ELIGIBLE"
      | "STRIPE_NOT_CONFIGURED"
      | "CHECKOUT_SESSION_CREATE_FAILED"
      | "PAYMENT_RECORD_NOT_FOUND"
      | "PAYMENT_SNAPSHOT_MISMATCH"
      | "PROMO_CODE_INVALID",
  ) {
    super(message);
    this.name = "PaymentFlowServiceError";
  }
}

const stripeCheckoutBookingSelect = {
  id: true,
  clientId: true,
  therapistId: true,
  bookingStatus: true,
  startsAt: true,
  endsAt: true,
  paymentDueBy: true,
  client: {
    select: {
      email: true,
      firstName: true,
      lastName: true,
      clientCreditBalance: {
        select: {
          balance: true,
          currency: true,
        },
      },
    },
  },
  therapist: {
    select: {
      email: true,
      firstName: true,
      lastName: true,
      therapistProfile: {
        select: {
          displayName: true,
          sessionPricePence: true,
          stripeAccountId: true,
          stripeOnboardingStatus: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
          stripeDetailsSubmitted: true,
        },
      },
    },
  },
  payment: {
    select: {
      id: true,
      paymentStatus: true,
      paidAt: true,
      failedAt: true,
      refundedAt: true,
      checkoutExpiresAt: true,
      creditAppliedAmount: true,
      promoCodeSnapshot: true,
      promoDiscountPercent: true,
      promoDiscountAmount: true,
      clientPayableAmount: true,
      stripeChargeAmount: true,
    },
  },
} satisfies Prisma.BookingSelect;

type StripeCheckoutBooking = Prisma.BookingGetPayload<{
  select: typeof stripeCheckoutBookingSelect;
}>;

export type CreateClientStripeCheckoutSessionInput = {
  bookingId: string;
  promoCode?: string;
  successUrl: string;
  cancelUrl: string;
};

export type StripeCheckoutSessionResult = {
  checkoutUrl: string | null;
  sessionId: string | null;
  paymentId: string;
  amount: number;
  chargeAmount: number;
  creditAppliedAmount: number;
  promoCode: string | null;
  promoDiscountPercent: number;
  promoDiscountAmount: number;
  clientPayableAmount: number;
  currency: string;
  expiresAt: Date | null;
  completedFromCredit: boolean;
};

export type StripeCheckoutSuccessSyncResult =
  | {
      status: "paid";
      paymentId: string;
      bookingId: string;
    }
  | {
      status: "pending";
      bookingId: string;
      reason:
        | "SESSION_NOT_COMPLETE"
        | "SESSION_NOT_PAID"
        | "BOOKING_MISMATCH"
        | "NOT_FOUND";
    };

function normalizeCheckoutSessionId(checkoutSessionId: string) {
  const trimmed = checkoutSessionId.trim();

  if (!trimmed) {
    return "";
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function getCheckoutSessionPaymentIntentId(paymentIntent: Stripe.Checkout.Session["payment_intent"]) {
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
}

function getCheckoutSessionChargeId(paymentIntent: Stripe.Checkout.Session["payment_intent"]) {
  if (!paymentIntent || typeof paymentIntent === "string") {
    return null;
  }

  const latestCharge = paymentIntent.latest_charge;

  if (!latestCharge) {
    return null;
  }

  return typeof latestCharge === "string" ? latestCharge : latestCharge.id;
}

function buildCreditSuccessUrl(successUrl: string) {
  const url = new URL(successUrl);
  url.searchParams.delete("session_id");
  url.searchParams.set("source", "credit");
  return url.toString();
}

function getTransferGroup(bookingId: string) {
  return `theraply_booking_${bookingId}`;
}

type StripePaymentUpdateResult = {
  paymentId: string;
  bookingId: string;
  paymentStatus: PaymentStatus;
};

function assertStripeAmountMatchesPaymentSnapshot(
  payment: {
    id: string;
    amount: number;
    currency: string;
    creditAppliedAmount: number | null;
    therapistAmount: number | null;
    platformFeeAmount: number | null;
    promoCodeSnapshot: string | null;
    promoDiscountPercent: number | null;
    promoDiscountAmount: number | null;
    clientPayableAmount: number | null;
    stripeChargeAmount: number | null;
  },
  stripeAmount: number,
  stripeCurrency: string,
  metadata?: Stripe.Metadata | null,
) {
  let snapshot;

  try {
    snapshot = resolvePaymentFinancialSnapshot(payment);
  } catch (error) {
    throw new PaymentFlowServiceError(
      error instanceof Error ? error.message : "Payment snapshot is invalid.",
      "PAYMENT_SNAPSHOT_MISMATCH",
    );
  }

  if (
    snapshot.stripeChargeAmount !== stripeAmount ||
    payment.currency.toLowerCase() !== stripeCurrency.toLowerCase()
  ) {
    throw new PaymentFlowServiceError(
      "Stripe payment values do not match the authoritative Payment snapshot.",
      "PAYMENT_SNAPSHOT_MISMATCH",
    );
  }

  if (metadata) {
    const expectedMetadata: Record<string, string> = {
      paymentId: payment.id,
      grossAmount: String(snapshot.grossAmount),
      promoCode: snapshot.promoCodeSnapshot ?? "",
      promoDiscountPercent: String(snapshot.promoDiscountPercent),
      promoDiscountAmount: String(snapshot.promoDiscountAmount),
      clientPayableAmount: String(snapshot.clientPayableAmount),
      creditAppliedAmount: String(snapshot.creditAppliedAmount),
      stripeChargeAmount: String(snapshot.stripeChargeAmount),
      platformFeeAmount: String(snapshot.platformFeeAmount),
      therapistAmount: String(snapshot.therapistAmount),
    };

    for (const [key, expectedValue] of Object.entries(expectedMetadata)) {
      const stripeValue = metadata[key];

      if (stripeValue !== undefined && stripeValue !== expectedValue) {
        throw new PaymentFlowServiceError(
          "Stripe metadata does not match the authoritative Payment snapshot.",
          "PAYMENT_SNAPSHOT_MISMATCH",
        );
      }
    }
  }

  return snapshot;
}

type ResolvedCheckoutPromo = {
  id: string;
  code: string;
  discountPercent: number;
};

class PromoCodeResolutionError extends Error {
  constructor(public readonly reason: string) {
    super("Promo code is invalid or unavailable.");
    this.name = "PromoCodeResolutionError";
  }
}

async function resolveCheckoutPromo(
  database: Pick<Prisma.TransactionClient, "promoCode"> | typeof prisma,
  promoCodeInput: string,
  now = new Date(),
): Promise<ResolvedCheckoutPromo> {
  let normalizedCode: string;

  try {
    normalizedCode = validatePromoCodeFormat(promoCodeInput);
  } catch (error) {
    throw new PromoCodeResolutionError(
      error instanceof PromoCodeValidationError ? error.code : "INVALID_CODE",
    );
  }

  const promoCode = await database.promoCode.findUnique({
    where: { code: normalizedCode },
    select: {
      id: true,
      code: true,
      discountPercent: true,
      isActive: true,
      expiresAt: true,
    },
  });

  if (!promoCode) {
    throw new PromoCodeResolutionError("UNKNOWN");
  }

  try {
    assertPromoCodeUsable(promoCode, now);
    validatePromoDiscountPercent(promoCode.discountPercent);
  } catch (error) {
    throw new PromoCodeResolutionError(
      error instanceof PromoCodeValidationError ? error.code : "INVALID_RECORD",
    );
  }

  return {
    id: promoCode.id,
    code: normalizedCode,
    discountPercent: promoCode.discountPercent,
  };
}

async function auditPromoCodeRejected({
  clientUserId,
  bookingId,
  promoCode,
  reason,
}: {
  clientUserId: string;
  bookingId: string;
  promoCode: string;
  reason: string;
}) {
  await createAuditLogEntryBestEffort({
    actorUserId: clientUserId,
    entityType: "Booking",
    entityId: bookingId,
    action: "PROMO_CODE_REJECTED",
    after: {
      bookingId,
      promoCode: promoCode.trim().toUpperCase().slice(0, 32),
      reason,
    },
  });
}

export function getPaymentDueBy(startsAt: Date) {
  return new Date(
    startsAt.getTime() - PAYMENT_POLICY_HOURS_BEFORE_SESSION * 60 * 60 * 1000,
  );
}

function getDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const fullName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ");
  return fullName || user.email?.trim() || "Theraply user";
}

function getTherapistCheckoutName(booking: StripeCheckoutBooking) {
  return (
    booking.therapist.therapistProfile?.displayName?.trim() ||
    getDisplayName(booking.therapist)
  );
}

function buildStripeCheckoutExpiresAt(paymentDueBy: Date, now = new Date()) {
  const maxCheckoutLifetimeMs = 23 * 60 * 60 * 1000;
  const latestExpiry = new Date(now.getTime() + maxCheckoutLifetimeMs);
  const checkoutExpiry = paymentDueBy < latestExpiry ? paymentDueBy : latestExpiry;

  return checkoutExpiry > now ? checkoutExpiry : null;
}

function getAvailableClientCreditAmount(
  booking: {
    client: {
      clientCreditBalance: { balance: number } | null;
    };
  },
) {
  return booking.client.clientCreditBalance?.balance ?? 0;
}

function getProjectedCreditAmounts(totalAmount: number | null, availableCreditAmount: number) {
  if (!totalAmount || totalAmount <= 0) {
    return {
      availableCreditAmount,
      projectedCreditAppliedAmount: 0,
      projectedStripeChargeAmount: totalAmount,
    };
  }

  const breakdown = calculatePaymentBreakdown({
    grossAmount: totalAmount,
    promoDiscountPercent: 0,
    availableClientCredit: availableCreditAmount,
  });

  return {
    availableCreditAmount,
    projectedCreditAppliedAmount: breakdown.creditAppliedAmount,
    projectedStripeChargeAmount: breakdown.stripeChargeAmount,
  };
}

function buildCheckoutLineItem(booking: StripeCheckoutBooking, unitAmountOverride?: number) {
  const therapistName = getTherapistCheckoutName(booking);
  const sessionDate = formatAppDateTime(booking.startsAt, {
    timeZone: DEFAULT_APP_TIME_ZONE,
  });
  const unitAmount = unitAmountOverride ?? booking.therapist.therapistProfile?.sessionPricePence;

  if (!unitAmount) {
    throw new PaymentFlowServiceError(
      PAYMENT_ELIGIBILITY_MESSAGES.missingPrice,
      "PAYMENT_NOT_ELIGIBLE",
    );
  }

  return {
    quantity: 1,
    price_data: {
      currency: PAYMENT_CURRENCY,
      unit_amount: unitAmount,
      product_data: {
        name: `Therapy session with ${therapistName}`,
        description: `Confirmed session starting ${sessionDate}`,
      },
    },
  };
}

function buildEligibilityResult(
  booking: PaymentEligibilityBooking,
  code: PaymentEligibilityCode,
  message: string,
  canPay: boolean,
): PaymentEligibility {
  const amount = booking.therapist.therapistProfile?.sessionPricePence ?? null;
  const availableCreditAmount = getAvailableClientCreditAmount(booking);
  const projectedCredit = getProjectedCreditAmounts(amount, availableCreditAmount);

  return {
    canPay,
    code,
    message,
    amount,
    projectedStripeChargeAmount: projectedCredit.projectedStripeChargeAmount,
    projectedCreditAppliedAmount: projectedCredit.projectedCreditAppliedAmount,
    availableCreditAmount: projectedCredit.availableCreditAmount,
    currency: PAYMENT_CURRENCY,
    paymentDueBy: booking.paymentDueBy ?? getPaymentDueBy(booking.startsAt),
    therapistSessionPricePence: amount,
    paymentStatus: booking.payment?.paymentStatus ?? null,
  };
}

function evaluatePaymentEligibility(
  booking: PaymentEligibilityBooking,
  now = new Date(),
): PaymentEligibility {
  if (
    booking.bookingStatus === BookingStatus.REJECTED ||
    booking.bookingStatus === BookingStatus.CANCELLED ||
    booking.bookingStatus === BookingStatus.AUTO_CANCELLED ||
    booking.bookingStatus === BookingStatus.COMPLETED
  ) {
    return buildEligibilityResult(
      booking,
      "BOOKING_CLOSED",
      PAYMENT_ELIGIBILITY_MESSAGES.bookingClosed,
      false,
    );
  }

  if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
    return buildEligibilityResult(
      booking,
      "BOOKING_NOT_CONFIRMED",
      PAYMENT_ELIGIBILITY_MESSAGES.bookingNotConfirmed,
      false,
    );
  }

  if (!booking.therapist.therapistProfile?.sessionPricePence) {
    return buildEligibilityResult(
      booking,
      "MISSING_THERAPIST_PRICE",
      PAYMENT_ELIGIBILITY_MESSAGES.missingPrice,
      false,
    );
  }

  if (!isStripeConnectReady(booking.therapist.therapistProfile)) {
    return buildEligibilityResult(
      booking,
      "THERAPIST_STRIPE_NOT_READY",
      PAYMENT_ELIGIBILITY_MESSAGES.therapistStripeNotReady,
      false,
    );
  }

  const paymentDueBy = booking.paymentDueBy ?? getPaymentDueBy(booking.startsAt);

  if (paymentDueBy <= now) {
    return buildEligibilityResult(
      booking,
      "PAYMENT_DEADLINE_PASSED",
      PAYMENT_ELIGIBILITY_MESSAGES.deadlinePassed,
      false,
    );
  }

  switch (booking.payment?.paymentStatus) {
    case PaymentStatus.PAID:
      return buildEligibilityResult(
        booking,
        "ALREADY_PAID",
        PAYMENT_ELIGIBILITY_MESSAGES.alreadyPaid,
        false,
      );
    case PaymentStatus.PENDING:
      return buildEligibilityResult(
        booking,
        "PAYMENT_PENDING",
        PAYMENT_ELIGIBILITY_MESSAGES.paymentPending,
        false,
      );
    case PaymentStatus.REFUNDED:
      return buildEligibilityResult(
        booking,
        "REFUNDED",
        PAYMENT_ELIGIBILITY_MESSAGES.refunded,
        false,
      );
    default:
      return buildEligibilityResult(
        booking,
        "ELIGIBLE",
        PAYMENT_ELIGIBILITY_MESSAGES.eligible,
        true,
      );
  }
}

function isClosedBookingStatus(status: BookingStatus) {
  return (
    status === BookingStatus.REJECTED ||
    status === BookingStatus.CANCELLED ||
    status === BookingStatus.AUTO_CANCELLED ||
    status === BookingStatus.COMPLETED
  );
}

async function getPaymentEligibilityBookingOrThrow(
  bookingId: string,
  clientUserId?: string,
) {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId: clientUserId,
    },
    select: paymentEligibilitySelect,
  });

  if (!booking) {
    throw new PaymentFlowServiceError("Booking not found for payment flow.", "BOOKING_NOT_FOUND");
  }

  return booking;
}

async function getStripePaymentBookingOrThrow(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      id: true,
      clientId: true,
      bookingStatus: true,
      paymentDueBy: true,
      startsAt: true,
      compensationResolutionType: true,
      compensationResolvedAt: true,
      payment: {
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentStatus: true,
          paidAt: true,
          creditAppliedAmount: true,
          promoCodeSnapshot: true,
          promoDiscountPercent: true,
          promoDiscountAmount: true,
          clientPayableAmount: true,
          stripeChargeAmount: true,
          stripeCheckoutSessionId: true,
          stripeChargeId: true,
          stripeRefundId: true,
          stripeTransferGroup: true,
          platformFeeAmount: true,
          therapistAmount: true,
          transferStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new PaymentFlowServiceError("Booking not found for payment flow.", "BOOKING_NOT_FOUND");
  }

  return booking;
}

export async function getClientPaymentEligibility(
  clientUserId: string,
  bookingId: string,
): Promise<PaymentEligibility> {
  const booking = await getPaymentEligibilityBookingOrThrow(bookingId, clientUserId);
  return evaluatePaymentEligibility(booking);
}

export async function assertClientBookingPaymentEligible(
  clientUserId: string,
  bookingId: string,
): Promise<PaymentEligibility> {
  const eligibility = await getClientPaymentEligibility(clientUserId, bookingId);

  if (!eligibility.canPay) {
    throw new PaymentFlowServiceError(eligibility.message, "PAYMENT_NOT_ELIGIBLE");
  }

  return eligibility;
}

export async function previewClientPromoCode(
  clientUserId: string,
  input: { bookingId: string; promoCode: string },
): Promise<PromoCodePreview> {
  const booking = await getPaymentEligibilityBookingOrThrow(
    input.bookingId,
    clientUserId,
  );
  const eligibility = evaluatePaymentEligibility(booking);

  if (!eligibility.canPay || !eligibility.amount) {
    throw new PaymentFlowServiceError(
      eligibility.message,
      "PAYMENT_NOT_ELIGIBLE",
    );
  }

  let promoCode: ResolvedCheckoutPromo;

  try {
    promoCode = await resolveCheckoutPromo(prisma, input.promoCode);
  } catch (error) {
    if (error instanceof PromoCodeResolutionError) {
      await auditPromoCodeRejected({
        clientUserId,
        bookingId: input.bookingId,
        promoCode: input.promoCode,
        reason: error.reason,
      });
      throw new PaymentFlowServiceError(error.message, "PROMO_CODE_INVALID");
    }

    throw error;
  }

  const breakdown = calculatePaymentBreakdown({
    grossAmount: eligibility.amount,
    promoDiscountPercent: promoCode.discountPercent,
    availableClientCredit: eligibility.availableCreditAmount,
  });

  return {
    valid: true,
    normalizedCode: promoCode.code,
    discountPercent: promoCode.discountPercent,
    promoDiscountAmount: breakdown.promoDiscountAmount,
    grossAmount: breakdown.grossAmount,
    clientPayableAmount: breakdown.clientPayableAmount,
    projectedCreditAppliedAmount: breakdown.creditAppliedAmount,
    projectedStripeChargeAmount: breakdown.stripeChargeAmount,
    currency: eligibility.currency,
  };
}

export async function createClientStripeCheckoutSession(
  clientUserId: string,
  input: CreateClientStripeCheckoutSessionInput,
): Promise<StripeCheckoutSessionResult> {
  const prepared = await prisma.$transaction(
    async (tx) => {
      await acquireFinancialTransactionLock(tx, `client-credit:${clientUserId}`);
      await acquireFinancialTransactionLock(tx, `checkout:${input.bookingId}`);

      const booking = await tx.booking.findFirst({
        where: {
          id: input.bookingId,
          clientId: clientUserId,
        },
        select: stripeCheckoutBookingSelect,
      });

      if (!booking) {
        throw new PaymentFlowServiceError(
          "Booking not found for payment flow.",
          "BOOKING_NOT_FOUND",
        );
      }

      const eligibility = evaluatePaymentEligibility(booking);

      if (!eligibility.canPay || !eligibility.amount) {
        throw new PaymentFlowServiceError(eligibility.message, "PAYMENT_NOT_ELIGIBLE");
      }

      const promoCode = input.promoCode
        ? await resolveCheckoutPromo(tx, input.promoCode)
        : null;
      const breakdown = calculatePaymentBreakdown({
        grossAmount: eligibility.amount,
        promoDiscountPercent: promoCode?.discountPercent ?? 0,
        availableClientCredit: getAvailableClientCreditAmount(booking),
      });
      const completedFromCredit = breakdown.stripeChargeAmount === 0;
      const checkoutExpiresAt = completedFromCredit
        ? null
        : buildStripeCheckoutExpiresAt(eligibility.paymentDueBy);

      if (!completedFromCredit && !checkoutExpiresAt) {
        throw new PaymentFlowServiceError(
          PAYMENT_ELIGIBILITY_MESSAGES.deadlinePassed,
          "PAYMENT_NOT_ELIGIBLE",
        );
      }

      if (!completedFromCredit && !isStripeConfigured()) {
        throw new PaymentFlowServiceError(
          "Stripe is not configured yet in this environment.",
          "STRIPE_NOT_CONFIGURED",
        );
      }

      const paidAt = completedFromCredit ? new Date() : null;
      const payment = await tx.payment.upsert({
        where: {
          bookingId: booking.id,
        },
        update: {
          amount: breakdown.grossAmount,
          currency: eligibility.currency,
          paymentStatus: completedFromCredit ? PaymentStatus.PAID : PaymentStatus.PENDING,
          checkoutExpiresAt,
          paidAt,
          failedAt: null,
          refundedAt: null,
          failedReason: null,
          refundReason: null,
          refundedAmount: null,
          creditAppliedAmount: breakdown.creditAppliedAmount,
          promoCodeId: promoCode?.id ?? null,
          promoCodeSnapshot: promoCode?.code ?? null,
          promoDiscountPercent: promoCode?.discountPercent ?? null,
          promoDiscountAmount: breakdown.promoDiscountAmount,
          clientPayableAmount: breakdown.clientPayableAmount,
          stripeChargeAmount: breakdown.stripeChargeAmount,
          stripeRefundId: null,
          stripeCheckoutSessionId: null,
          stripePaymentIntentId: null,
          stripeChargeId: null,
          stripeTransferId: null,
          stripeTransferGroup: getTransferGroup(booking.id),
          platformFeeAmount: breakdown.platformFeeAmount,
          therapistAmount: breakdown.therapistAmount,
          transferStatus: PaymentTransferStatus.NOT_ELIGIBLE,
        },
        create: {
          bookingId: booking.id,
          amount: breakdown.grossAmount,
          currency: eligibility.currency,
          paymentStatus: completedFromCredit ? PaymentStatus.PAID : PaymentStatus.PENDING,
          checkoutExpiresAt,
          paidAt,
          creditAppliedAmount: breakdown.creditAppliedAmount,
          promoCodeId: promoCode?.id ?? null,
          promoCodeSnapshot: promoCode?.code ?? null,
          promoDiscountPercent: promoCode?.discountPercent ?? null,
          promoDiscountAmount: breakdown.promoDiscountAmount,
          clientPayableAmount: breakdown.clientPayableAmount,
          stripeChargeAmount: breakdown.stripeChargeAmount,
          stripeTransferGroup: getTransferGroup(booking.id),
          platformFeeAmount: breakdown.platformFeeAmount,
          therapistAmount: breakdown.therapistAmount,
          transferStatus: PaymentTransferStatus.NOT_ELIGIBLE,
        },
        select: {
          id: true,
        },
      });

      const creditResult = await applyClientCreditToPaymentInTransaction(tx, {
        clientId: clientUserId,
        bookingId: booking.id,
        paymentId: payment.id,
        amount: breakdown.creditAppliedAmount,
        currency: eligibility.currency,
        notes: completedFromCredit
          ? "Applied in full to settle a confirmed session without Stripe checkout."
          : "Applied toward the next confirmed session before Stripe checkout.",
      });

      return {
        booking,
        paymentId: payment.id,
        breakdown,
        checkoutExpiresAt,
        completedFromCredit,
        promoCode,
        creditAppliedNow: creditResult.appliedNow,
        currency: eligibility.currency,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  ).catch(async (error) => {
    if (error instanceof PromoCodeResolutionError) {
      await auditPromoCodeRejected({
        clientUserId,
        bookingId: input.bookingId,
        promoCode: input.promoCode ?? "",
        reason: error.reason,
      });
      throw new PaymentFlowServiceError(error.message, "PROMO_CODE_INVALID");
    }

    throw error;
  });

  const {
    booking,
    paymentId,
    breakdown,
    checkoutExpiresAt,
    completedFromCredit,
    promoCode,
    creditAppliedNow,
    currency,
  } = prepared;

  if (promoCode) {
    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "Payment",
      entityId: paymentId,
      action: "PROMO_CODE_APPLIED",
      after: {
        bookingId: booking.id,
        paymentId,
        promoCode: promoCode.code,
        discountPercent: promoCode.discountPercent,
        discountAmount: breakdown.promoDiscountAmount,
      },
    });
  }

  if (creditAppliedNow) {
    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "ClientCreditBalance",
      entityId: clientUserId,
      action: "CLIENT_CREDIT_APPLIED",
      after: {
        bookingId: booking.id,
        paymentId,
        appliedAmount: breakdown.creditAppliedAmount,
      },
    });
  }

  if (completedFromCredit) {
    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "Payment",
      entityId: paymentId,
      action: "PAYMENT_SETTLED_WITH_CLIENT_CREDIT",
      after: {
        bookingId: booking.id,
        amount: breakdown.grossAmount,
        currency,
        creditAppliedAmount: breakdown.creditAppliedAmount,
        promoCode: promoCode?.code ?? null,
        promoDiscountPercent: promoCode?.discountPercent ?? 0,
        promoDiscountAmount: breakdown.promoDiscountAmount,
        clientPayableAmount: breakdown.clientPayableAmount,
        therapistAmount: breakdown.therapistAmount,
        platformFeeAmount: breakdown.platformFeeAmount,
      },
    });

    await sendPaymentSuccessfulEmailBestEffort(booking.id);

    return {
      checkoutUrl: buildCreditSuccessUrl(input.successUrl),
      sessionId: null,
      paymentId,
      amount: breakdown.grossAmount,
      chargeAmount: 0,
      creditAppliedAmount: breakdown.creditAppliedAmount,
      promoCode: promoCode?.code ?? null,
      promoDiscountPercent: promoCode?.discountPercent ?? 0,
      promoDiscountAmount: breakdown.promoDiscountAmount,
      clientPayableAmount: breakdown.clientPayableAmount,
      currency,
      expiresAt: null,
      completedFromCredit: true,
    };
  }

  const stripe = getStripeClient();
  let checkoutSessionId: string | null = null;

  try {
    const metadata = {
      bookingId: booking.id,
      paymentId,
      clientUserId,
      therapistUserId: booking.therapistId,
      grossAmount: String(breakdown.grossAmount),
      promoCode: promoCode?.code ?? "",
      promoDiscountPercent: String(promoCode?.discountPercent ?? 0),
      promoDiscountAmount: String(breakdown.promoDiscountAmount),
      clientPayableAmount: String(breakdown.clientPayableAmount),
      creditAppliedAmount: String(breakdown.creditAppliedAmount),
      stripeChargeAmount: String(breakdown.stripeChargeAmount),
      platformFeeAmount: String(breakdown.platformFeeAmount),
      therapistAmount: String(breakdown.therapistAmount),
    };
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: booking.client.email,
      client_reference_id: booking.id,
      line_items: [buildCheckoutLineItem(booking, breakdown.stripeChargeAmount)],
      metadata,
      payment_intent_data: {
        transfer_group: getTransferGroup(booking.id),
        metadata,
      },
      expires_at: checkoutExpiresAt
        ? Math.floor(checkoutExpiresAt.getTime() / 1000)
        : undefined,
    }, {
      idempotencyKey: `theraply-checkout-${paymentId}-${checkoutExpiresAt?.getTime()}`,
    });
    checkoutSessionId = checkoutSession.id;

    if (!checkoutSession.url) {
      throw new PaymentFlowServiceError(
        "Stripe Checkout did not return a redirect URL.",
        "CHECKOUT_SESSION_CREATE_FAILED",
      );
    }

    await prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null,
        creditAppliedAmount: breakdown.creditAppliedAmount,
      },
    });

    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "Payment",
      entityId: paymentId,
      action: "STRIPE_CHECKOUT_SESSION_CREATED",
      after: {
        bookingId: booking.id,
        sessionId: checkoutSession.id,
        paymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null,
        grossAmount: breakdown.grossAmount,
        chargeAmount: breakdown.stripeChargeAmount,
        creditAppliedAmount: breakdown.creditAppliedAmount,
        expiresAt: checkoutExpiresAt,
      },
    });

    return {
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      paymentId,
      amount: breakdown.grossAmount,
      chargeAmount: breakdown.stripeChargeAmount,
      creditAppliedAmount: breakdown.creditAppliedAmount,
      promoCode: promoCode?.code ?? null,
      promoDiscountPercent: promoCode?.discountPercent ?? 0,
      promoDiscountAmount: breakdown.promoDiscountAmount,
      clientPayableAmount: breakdown.clientPayableAmount,
      currency,
      expiresAt: checkoutExpiresAt,
      completedFromCredit: false,
    };
  } catch (error) {
    if (checkoutSessionId) {
      await stripe.checkout.sessions.expire(checkoutSessionId).catch(() => undefined);
    }

    if (breakdown.creditAppliedAmount > 0) {
      await reverseClientCreditApplication({
        clientId: clientUserId,
        bookingId: booking.id,
        paymentId,
        amount: breakdown.creditAppliedAmount,
        currency,
        notes: "Reserved credit was restored because Stripe checkout could not be started.",
      });
    }

    await prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        paymentStatus: PaymentStatus.FAILED,
        failedAt: new Date(),
        failedReason: "Stripe Checkout session could not be created.",
        checkoutExpiresAt: null,
        creditAppliedAmount: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: null,
      },
    });

    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "StripeCheckout",
      entityId: paymentId,
      action: "STRIPE_CHECKOUT_SESSION_CREATE_FAILED",
      after: {
        bookingId: booking.id,
        grossAmount: breakdown.grossAmount,
        creditAppliedAmount: breakdown.creditAppliedAmount,
        chargeAmount: breakdown.stripeChargeAmount,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    if (error instanceof PaymentFlowServiceError) {
      throw error;
    }

    throw new PaymentFlowServiceError(
      error instanceof Error ? error.message : "Unable to create Stripe Checkout session.",
      "CHECKOUT_SESSION_CREATE_FAILED",
    );
  }
}

export async function syncClientStripeCheckoutSuccess(
  clientUserId: string,
  bookingId: string,
  checkoutSessionId: string,
): Promise<StripeCheckoutSuccessSyncResult> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId: clientUserId,
    },
    select: {
      id: true,
      payment: {
        select: {
          id: true,
          paymentStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new PaymentFlowServiceError("Booking not found for payment flow.", "BOOKING_NOT_FOUND");
  }

  if (booking.payment?.paymentStatus === PaymentStatus.PAID) {
    await sendPaymentSuccessfulEmailBestEffort(booking.id);

    return {
      status: "paid",
      paymentId: booking.payment.id,
      bookingId: booking.id,
    };
  }

  if (!isStripeConfigured()) {
    return {
      status: "pending",
      bookingId: booking.id,
      reason: "NOT_FOUND",
    };
  }

  const normalizedCheckoutSessionId = normalizeCheckoutSessionId(checkoutSessionId);

  if (
    !normalizedCheckoutSessionId ||
    normalizedCheckoutSessionId.includes("{CHECKOUT_SESSION_ID}") ||
    normalizedCheckoutSessionId.includes("%7BCHECKOUT_SESSION_ID%7D")
  ) {
    return {
      status: "pending",
      bookingId: booking.id,
      reason: "NOT_FOUND",
    };
  }

  const stripe = getStripeClient();
  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.retrieve(normalizedCheckoutSessionId, {
      expand: ["payment_intent"],
    });
  } catch (error) {
    const stripeLikeError =
      typeof error === "object" && error !== null
        ? (error as { code?: string })
        : null;

    if (stripeLikeError?.code === "resource_missing") {
      return {
        status: "pending",
        bookingId: booking.id,
        reason: "NOT_FOUND",
      };
    }

    throw error;
  }
  const sessionBookingId =
    session.metadata?.bookingId?.trim() ||
    session.client_reference_id?.trim() ||
    null;

  if (sessionBookingId !== booking.id) {
    return {
      status: "pending",
      bookingId: booking.id,
      reason: "BOOKING_MISMATCH",
    };
  }

  if (session.status !== "complete") {
    return {
      status: "pending",
      bookingId: booking.id,
      reason: "SESSION_NOT_COMPLETE",
    };
  }

  if (session.payment_status !== "paid") {
    return {
      status: "pending",
      bookingId: booking.id,
      reason: "SESSION_NOT_PAID",
    };
  }

  const paymentIntentId = getCheckoutSessionPaymentIntentId(session.payment_intent);
  const chargeId = getCheckoutSessionChargeId(session.payment_intent);

  const payment = await markStripeCheckoutSessionCompleted(booking.id, {
    checkoutSessionId: session.id,
    paymentIntentId,
    chargeId,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? PAYMENT_CURRENCY,
    metadata: session.metadata,
  });

  await createAuditLogEntryBestEffort({
    actorUserId: clientUserId,
    entityType: "Payment",
    entityId: payment.paymentId,
    action: "STRIPE_CHECKOUT_SESSION_RECONCILED_ON_SUCCESS_RETURN",
    after: {
      bookingId: booking.id,
      sessionId: session.id,
      paymentIntentId,
      chargeId,
    },
  });

  return {
    status: "paid",
    paymentId: payment.paymentId,
    bookingId: payment.bookingId,
  };
}

export async function markStripeCheckoutSessionCompleted(
  bookingId: string,
  input: {
    checkoutSessionId: string;
    paymentIntentId: string | null;
    chargeId?: string | null;
    amount: number;
    currency: string;
    metadata?: Stripe.Metadata | null;
  },
): Promise<StripePaymentUpdateResult> {
  const paidAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);
  const existingPayment = booking.payment;

  if (!existingPayment) {
    throw new PaymentFlowServiceError(
      "Payment record was not found for Stripe checkout reconciliation.",
      "PAYMENT_RECORD_NOT_FOUND",
    );
  }

  const snapshot = assertStripeAmountMatchesPaymentSnapshot(
    existingPayment,
    input.amount,
    input.currency,
    input.metadata,
  );
  const payment = await prisma.payment.update({
    where: {
      id: existingPayment.id,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripeCheckoutSessionId: input.checkoutSessionId,
      stripePaymentIntentId: input.paymentIntentId,
      stripeChargeId: input.chargeId ?? existingPayment.stripeChargeId ?? null,
      stripeTransferGroup: existingPayment.stripeTransferGroup ?? getTransferGroup(bookingId),
      platformFeeAmount: existingPayment.platformFeeAmount ?? snapshot.platformFeeAmount,
      therapistAmount: existingPayment.therapistAmount ?? snapshot.therapistAmount,
      transferStatus: existingPayment.transferStatus,
      paidAt: existingPayment.paidAt ?? paidAt,
      failedAt: null,
      refundedAt: null,
      failedReason: null,
      refundReason: null,
      refundedAmount: null,
      stripeRefundId: null,
      checkoutExpiresAt: null,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  if (
    booking.bookingStatus !== BookingStatus.CONFIRMED &&
    !isClosedBookingStatus(booking.bookingStatus)
  ) {
    await prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        bookingStatus: BookingStatus.CONFIRMED,
      },
    });
  }

  await sendPaymentSuccessfulEmailBestEffort(payment.bookingId);

  return {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    paymentStatus: payment.paymentStatus,
  };
}

export async function markStripePaymentIntentFailed(
  bookingId: string,
  input: {
    paymentIntentId: string;
    amount: number;
    currency: string;
    failedReason: string;
    metadata?: Stripe.Metadata | null;
  },
): Promise<StripePaymentUpdateResult> {
  const failedAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);

  if (!booking.payment) {
    throw new PaymentFlowServiceError(
      "Payment record was not found for Stripe failure reconciliation.",
      "PAYMENT_RECORD_NOT_FOUND",
    );
  }

  if (booking.payment.paymentStatus === PaymentStatus.FAILED) {
    return {
      paymentId: booking.payment.id,
      bookingId,
      paymentStatus: booking.payment.paymentStatus,
    };
  }

  assertStripeAmountMatchesPaymentSnapshot(
    booking.payment,
    input.amount,
    input.currency,
    input.metadata,
  );

  if (booking.payment.creditAppliedAmount) {
    await reverseClientCreditApplication({
      clientId: booking.clientId,
      bookingId,
      paymentId: booking.payment.id,
      amount: booking.payment.creditAppliedAmount,
      currency: booking.payment.currency,
      notes: "Credit was restored after Stripe reported a failed payment attempt.",
    });
  }

  const payment = await prisma.payment.update({
    where: {
      id: booking.payment.id,
    },
    data: {
      paymentStatus: PaymentStatus.FAILED,
      stripePaymentIntentId: input.paymentIntentId,
      failedAt,
      failedReason: input.failedReason,
      creditAppliedAmount: null,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  await sendPaymentFailedEmailBestEffort(payment.bookingId, {
    reason: input.failedReason,
  });

  return {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    paymentStatus: payment.paymentStatus,
  };
}

export async function markStripePaymentIntentSucceeded(
  bookingId: string,
  input: {
    paymentIntentId: string;
    chargeId: string | null;
    amount: number;
    currency: string;
    metadata?: Stripe.Metadata | null;
  },
): Promise<StripePaymentUpdateResult> {
  const paidAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);
  const existingPayment = booking.payment;

  if (!existingPayment) {
    throw new PaymentFlowServiceError(
      "Payment record was not found for Stripe success reconciliation.",
      "PAYMENT_RECORD_NOT_FOUND",
    );
  }

  const snapshot = assertStripeAmountMatchesPaymentSnapshot(
    existingPayment,
    input.amount,
    input.currency,
    input.metadata,
  );

  const payment = await prisma.payment.update({
    where: {
      id: existingPayment.id,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: input.paymentIntentId,
      stripeChargeId: input.chargeId ?? existingPayment.stripeChargeId ?? null,
      stripeTransferGroup: existingPayment.stripeTransferGroup ?? getTransferGroup(bookingId),
      platformFeeAmount: existingPayment.platformFeeAmount ?? snapshot.platformFeeAmount,
      therapistAmount: existingPayment.therapistAmount ?? snapshot.therapistAmount,
      transferStatus: existingPayment.transferStatus,
      paidAt: existingPayment.paidAt ?? paidAt,
      failedAt: null,
      refundedAt: null,
      failedReason: null,
      refundReason: null,
      refundedAmount: null,
      stripeRefundId: null,
      checkoutExpiresAt: null,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  await sendPaymentSuccessfulEmailBestEffort(payment.bookingId);

  return {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    paymentStatus: payment.paymentStatus,
  };
}

export async function markStripeCheckoutSessionExpired(
  bookingId: string,
  input: {
    checkoutSessionId: string | null;
    amount: number;
    currency: string;
    checkoutExpiresAt: Date | null;
    failedReason: string;
    metadata?: Stripe.Metadata | null;
  },
): Promise<StripePaymentUpdateResult> {
  const failedAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);

  if (!booking.payment) {
    throw new PaymentFlowServiceError(
      "Payment record was not found for Stripe expiry reconciliation.",
      "PAYMENT_RECORD_NOT_FOUND",
    );
  }

  if (booking.payment.paymentStatus === PaymentStatus.FAILED) {
    return {
      paymentId: booking.payment.id,
      bookingId,
      paymentStatus: booking.payment.paymentStatus,
    };
  }

  assertStripeAmountMatchesPaymentSnapshot(
    booking.payment,
    input.amount,
    input.currency,
    input.metadata,
  );

  if (booking.payment.creditAppliedAmount) {
    await reverseClientCreditApplication({
      clientId: booking.clientId,
      bookingId,
      paymentId: booking.payment.id,
      amount: booking.payment.creditAppliedAmount,
      currency: booking.payment.currency,
      notes: "Credit was restored after Stripe checkout expired.",
    });
  }

  const payment = await prisma.payment.update({
    where: {
      id: booking.payment.id,
    },
    data: {
      paymentStatus: PaymentStatus.FAILED,
      stripeCheckoutSessionId: input.checkoutSessionId ?? booking.payment.stripeCheckoutSessionId ?? null,
      checkoutExpiresAt: input.checkoutExpiresAt,
      failedAt,
      failedReason: input.failedReason,
      creditAppliedAmount: null,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  await sendPaymentFailedEmailBestEffort(payment.bookingId, {
    reason: input.failedReason,
  });

  return {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    paymentStatus: payment.paymentStatus,
  };
}

export async function markStripeChargeRefunded(
  bookingId: string,
  input: {
    refundId: string | null;
    refundedAmount: number | null;
    refundReason: string;
  },
): Promise<StripePaymentUpdateResult> {
  const booking = await getStripePaymentBookingOrThrow(bookingId);

  if (!booking.payment?.id) {
    throw new PaymentFlowServiceError(
      "Payment record was not found for Stripe refund processing.",
      "PAYMENT_RECORD_NOT_FOUND",
    );
  }

  const refundPayment = booking.payment;
  const refundedAt = new Date();
  const result = await prisma.$transaction(
    async (tx) => {
      await acquireFinancialTransactionLock(tx, `client-credit:${booking.clientId}`);
      await acquireFinancialTransactionLock(tx, `refund:${refundPayment.id}`);

      const currentPayment = await tx.payment.findUnique({
        where: {
          id: refundPayment.id,
        },
        select: {
          id: true,
          bookingId: true,
          paymentStatus: true,
          transferStatus: true,
          creditAppliedAmount: true,
          currency: true,
        },
      });

      if (!currentPayment) {
        throw new PaymentFlowServiceError(
          "Payment record was not found for refund reconciliation.",
          "PAYMENT_RECORD_NOT_FOUND",
        );
      }

      if (currentPayment.paymentStatus === PaymentStatus.REFUNDED) {
        return {
          payment: currentPayment,
          creditIssuedNow: false,
          transferReconciliationRequired:
            currentPayment.transferStatus === PaymentTransferStatus.TRANSFERRED,
        };
      }

      const payment = await tx.payment.update({
        where: {
          id: currentPayment.id,
        },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          refundedAt,
          refundedAmount: input.refundedAmount,
          stripeRefundId: input.refundId,
          refundReason: input.refundReason,
          transferStatus:
            currentPayment.transferStatus === PaymentTransferStatus.TRANSFERRED
              ? currentPayment.transferStatus
              : PaymentTransferStatus.NOT_ELIGIBLE,
        },
        select: {
          id: true,
          bookingId: true,
          paymentStatus: true,
          transferStatus: true,
        },
      });

      if (currentPayment.transferStatus !== PaymentTransferStatus.TRANSFERRED) {
        await tx.booking.update({
          where: {
            id: bookingId,
          },
          data: {
            compensationResolutionType: "REFUND",
            compensationResolvedAt: refundedAt,
          },
        });
      }

      const creditResult = currentPayment.creditAppliedAmount
        ? await issueClientCreditInTransaction(tx, {
            clientId: booking.clientId,
            bookingId,
            paymentId: currentPayment.id,
            amount: currentPayment.creditAppliedAmount,
            currency: currentPayment.currency,
            notes: "Credit was restored to the client after the booking payment was refunded.",
          })
        : { amount: 0, issuedNow: false };

      return {
        payment,
        creditIssuedNow: creditResult.issuedNow,
        transferReconciliationRequired:
          payment.transferStatus === PaymentTransferStatus.TRANSFERRED,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );

  if (result.creditIssuedNow) {
    await createAuditLogEntryBestEffort({
      actorUserId: booking.clientId,
      entityType: "ClientCreditBalance",
      entityId: booking.clientId,
      action: "CLIENT_CREDIT_ISSUED",
      after: {
        bookingId,
        paymentId: refundPayment.id,
        issuedAmount: refundPayment.creditAppliedAmount,
      },
    });
  }

  if (result.transferReconciliationRequired) {
    await createAuditLogEntryBestEffort({
      actorUserId: null,
      entityType: "Payment",
      entityId: refundPayment.id,
      action: "REFUND_TRANSFER_RECONCILIATION_REQUIRED",
      after: {
        bookingId,
        transferStatus: PaymentTransferStatus.TRANSFERRED,
      },
    });
  }

  return {
    paymentId: result.payment.id,
    bookingId: result.payment.bookingId,
    paymentStatus: result.payment.paymentStatus,
  };
}
