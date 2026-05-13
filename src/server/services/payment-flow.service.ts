import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_CURRENCY,
  PAYMENT_ELIGIBILITY_MESSAGES,
  PAYMENT_POLICY_HOURS_BEFORE_SESSION,
} from "@/lib/constants/payments";
import { isStripeConfigured } from "@/lib/stripe/stripe-config";
import { getStripeClient } from "@/lib/stripe/stripe";
import {
  applyClientCreditToPayment,
  issueClientCredit,
  reverseClientCreditApplication,
} from "@/server/services/client-credit.service";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
import {
  sendPaymentFailedEmailBestEffort,
  sendPaymentSuccessfulEmailBestEffort,
} from "@/server/services/transactional-email-events.service";

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
      | "PAYMENT_RECORD_NOT_FOUND",
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
    },
  },
} satisfies Prisma.BookingSelect;

type StripeCheckoutBooking = Prisma.BookingGetPayload<{
  select: typeof stripeCheckoutBookingSelect;
}>;

export type CreateClientStripeCheckoutSessionInput = {
  bookingId: string;
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

function buildCreditSuccessUrl(successUrl: string) {
  const url = new URL(successUrl);
  url.searchParams.delete("session_id");
  url.searchParams.set("source", "credit");
  return url.toString();
}

type StripePaymentUpdateResult = {
  paymentId: string;
  bookingId: string;
  paymentStatus: PaymentStatus;
};

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
  booking: PaymentEligibilityBooking | StripeCheckoutBooking,
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

  const projectedCreditAppliedAmount = Math.min(availableCreditAmount, totalAmount);
  const projectedStripeChargeAmount = totalAmount - projectedCreditAppliedAmount;

  return {
    availableCreditAmount,
    projectedCreditAppliedAmount,
    projectedStripeChargeAmount,
  };
}

function buildCheckoutLineItem(booking: StripeCheckoutBooking, unitAmountOverride?: number) {
  const therapistName = getTherapistCheckoutName(booking);
  const sessionDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(booking.startsAt);
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
          creditAppliedAmount: true,
          stripeRefundId: true,
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

export async function createClientStripeCheckoutSession(
  clientUserId: string,
  input: CreateClientStripeCheckoutSessionInput,
): Promise<StripeCheckoutSessionResult> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: input.bookingId,
      clientId: clientUserId,
    },
    select: stripeCheckoutBookingSelect,
  });

  if (!booking) {
    throw new PaymentFlowServiceError("Booking not found for payment flow.", "BOOKING_NOT_FOUND");
  }

  const eligibility = evaluatePaymentEligibility(booking);

  if (!eligibility.canPay || !eligibility.amount) {
    throw new PaymentFlowServiceError(eligibility.message, "PAYMENT_NOT_ELIGIBLE");
  }

  const creditAppliedAmount = eligibility.projectedCreditAppliedAmount;
  const chargeAmount = eligibility.projectedStripeChargeAmount ?? eligibility.amount;
  const checkoutExpiresAt = buildStripeCheckoutExpiresAt(eligibility.paymentDueBy);

  if (chargeAmount <= 0) {
    const payment = await prisma.payment.upsert({
      where: {
        bookingId: booking.id,
      },
      update: {
        amount: eligibility.amount,
        currency: eligibility.currency,
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date(),
        failedAt: null,
        refundedAt: null,
        failedReason: null,
        refundReason: null,
        refundedAmount: null,
        creditAppliedAmount,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        stripeRefundId: null,
        checkoutExpiresAt: null,
      },
      create: {
        bookingId: booking.id,
        amount: eligibility.amount,
        currency: eligibility.currency,
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date(),
        creditAppliedAmount,
      },
      select: {
        id: true,
      },
    });

    if (creditAppliedAmount > 0) {
      await applyClientCreditToPayment({
        clientId: clientUserId,
        bookingId: booking.id,
        paymentId: payment.id,
        amount: creditAppliedAmount,
        currency: eligibility.currency,
        notes: "Applied in full to settle a confirmed session without Stripe checkout.",
      });
    }

    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "PAYMENT_SETTLED_WITH_CLIENT_CREDIT",
      after: {
        bookingId: booking.id,
        amount: eligibility.amount,
        currency: eligibility.currency,
        creditAppliedAmount,
      },
    });

    await sendPaymentSuccessfulEmailBestEffort(booking.id);

    return {
      checkoutUrl: buildCreditSuccessUrl(input.successUrl),
      sessionId: null,
      paymentId: payment.id,
      amount: eligibility.amount,
      chargeAmount: 0,
      creditAppliedAmount,
      currency: eligibility.currency,
      expiresAt: null,
      completedFromCredit: true,
    };
  }

  if (!isStripeConfigured()) {
    throw new PaymentFlowServiceError(
      "Stripe is not configured yet in this environment.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

  const stripe = getStripeClient();

  let paymentId: string | null = null;

  try {
    const payment = await prisma.payment.upsert({
      where: {
        bookingId: booking.id,
      },
      update: {
        amount: eligibility.amount,
        currency: eligibility.currency,
        paymentStatus: PaymentStatus.PENDING,
        checkoutExpiresAt,
        paidAt: null,
        failedAt: null,
        refundedAt: null,
        failedReason: null,
        refundReason: null,
        refundedAmount: null,
        stripeRefundId: null,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        creditAppliedAmount: null,
      },
      create: {
        bookingId: booking.id,
        amount: eligibility.amount,
        currency: eligibility.currency,
        paymentStatus: PaymentStatus.PENDING,
        checkoutExpiresAt,
      },
      select: {
        id: true,
      },
    });
    paymentId = payment.id;

    if (creditAppliedAmount > 0) {
      await applyClientCreditToPayment({
        clientId: clientUserId,
        bookingId: booking.id,
        paymentId: payment.id,
        amount: creditAppliedAmount,
        currency: eligibility.currency,
        notes: "Applied toward the next confirmed session before Stripe checkout.",
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: booking.client.email,
      client_reference_id: booking.id,
      line_items: [buildCheckoutLineItem(booking, chargeAmount)],
      metadata: {
        bookingId: booking.id,
        clientUserId,
        therapistUserId: booking.therapistId,
        creditAppliedAmount: String(creditAppliedAmount),
        grossAmount: String(eligibility.amount),
      },
      payment_intent_data: {
        metadata: {
          bookingId: booking.id,
          clientUserId,
          therapistUserId: booking.therapistId,
          creditAppliedAmount: String(creditAppliedAmount),
          grossAmount: String(eligibility.amount),
        },
      },
      expires_at: checkoutExpiresAt
        ? Math.floor(checkoutExpiresAt.getTime() / 1000)
        : undefined,
    });

    if (!checkoutSession.url) {
      throw new PaymentFlowServiceError(
        "Stripe Checkout did not return a redirect URL.",
        "CHECKOUT_SESSION_CREATE_FAILED",
      );
    }

    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null,
        creditAppliedAmount,
      },
    });

    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "Payment",
      entityId: payment.id,
      action: "STRIPE_CHECKOUT_SESSION_CREATED",
      after: {
        bookingId: booking.id,
        sessionId: checkoutSession.id,
        paymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null,
        grossAmount: eligibility.amount,
        chargeAmount,
        creditAppliedAmount,
        expiresAt: checkoutExpiresAt,
      },
    });

    return {
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      paymentId: payment.id,
      amount: eligibility.amount,
      chargeAmount,
      creditAppliedAmount,
      currency: eligibility.currency,
      expiresAt: checkoutExpiresAt,
      completedFromCredit: false,
    };
  } catch (error) {
    if (paymentId && creditAppliedAmount > 0) {
      await reverseClientCreditApplication({
        clientId: clientUserId,
        bookingId: booking.id,
        paymentId,
        amount: creditAppliedAmount,
        currency: eligibility.currency,
        notes: "Reserved credit was restored because Stripe checkout could not be started.",
      });

      await prisma.payment.update({
        where: {
          id: paymentId,
        },
        data: {
          creditAppliedAmount: null,
        },
      });
    }

    await createAuditLogEntryBestEffort({
      actorUserId: clientUserId,
      entityType: "StripeCheckout",
      entityId: paymentId ?? booking.id,
      action: "STRIPE_CHECKOUT_SESSION_CREATE_FAILED",
      after: {
        bookingId: booking.id,
        grossAmount: eligibility.amount,
        creditAppliedAmount,
        chargeAmount,
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
    session = await stripe.checkout.sessions.retrieve(normalizedCheckoutSessionId);
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

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const payment = await markStripeCheckoutSessionCompleted(booking.id, {
    checkoutSessionId: session.id,
    paymentIntentId,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? PAYMENT_CURRENCY,
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
    amount: number;
    currency: string;
  },
): Promise<StripePaymentUpdateResult> {
  const paidAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);
  const existingPayment = booking.payment;

  const payment = await prisma.payment.upsert({
    where: {
      bookingId,
    },
    update: {
      amount: existingPayment?.amount ?? input.amount,
      currency: existingPayment?.currency ?? input.currency,
      paymentStatus: PaymentStatus.PAID,
      stripeCheckoutSessionId: input.checkoutSessionId,
      stripePaymentIntentId: input.paymentIntentId,
      paidAt,
      failedAt: null,
      refundedAt: null,
      failedReason: null,
      refundReason: null,
      refundedAmount: null,
      stripeRefundId: null,
      checkoutExpiresAt: null,
    },
    create: {
      bookingId,
      amount: input.amount,
      currency: input.currency,
      paymentStatus: PaymentStatus.PAID,
      stripeCheckoutSessionId: input.checkoutSessionId,
      stripePaymentIntentId: input.paymentIntentId,
      paidAt,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
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
  },
): Promise<StripePaymentUpdateResult> {
  const failedAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);

  if (booking.payment?.creditAppliedAmount) {
    await reverseClientCreditApplication({
      clientId: booking.clientId,
      bookingId,
      paymentId: booking.payment.id,
      amount: booking.payment.creditAppliedAmount,
      currency: booking.payment.currency,
      notes: "Credit was restored after Stripe reported a failed payment attempt.",
    });
  }

  const payment = await prisma.payment.upsert({
    where: {
      bookingId,
    },
    update: {
      amount: booking.payment?.amount ?? input.amount,
      currency: booking.payment?.currency ?? input.currency,
      paymentStatus: PaymentStatus.FAILED,
      stripePaymentIntentId: input.paymentIntentId,
      failedAt,
      failedReason: input.failedReason,
      creditAppliedAmount: null,
    },
    create: {
      bookingId,
      amount: input.amount,
      currency: input.currency,
      paymentStatus: PaymentStatus.FAILED,
      stripePaymentIntentId: input.paymentIntentId,
      failedAt,
      failedReason: input.failedReason,
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

export async function markStripeCheckoutSessionExpired(
  bookingId: string,
  input: {
    checkoutSessionId: string;
    amount: number;
    currency: string;
    checkoutExpiresAt: Date | null;
    failedReason: string;
  },
): Promise<StripePaymentUpdateResult> {
  const failedAt = new Date();
  const booking = await getStripePaymentBookingOrThrow(bookingId);

  if (booking.payment?.creditAppliedAmount) {
    await reverseClientCreditApplication({
      clientId: booking.clientId,
      bookingId,
      paymentId: booking.payment.id,
      amount: booking.payment.creditAppliedAmount,
      currency: booking.payment.currency,
      notes: "Credit was restored after Stripe checkout expired.",
    });
  }

  const payment = await prisma.payment.upsert({
    where: {
      bookingId,
    },
    update: {
      amount: booking.payment?.amount ?? input.amount,
      currency: booking.payment?.currency ?? input.currency,
      paymentStatus: PaymentStatus.FAILED,
      stripeCheckoutSessionId: input.checkoutSessionId,
      checkoutExpiresAt: input.checkoutExpiresAt,
      failedAt,
      failedReason: input.failedReason,
      creditAppliedAmount: null,
    },
    create: {
      bookingId,
      amount: input.amount,
      currency: input.currency,
      paymentStatus: PaymentStatus.FAILED,
      stripeCheckoutSessionId: input.checkoutSessionId,
      checkoutExpiresAt: input.checkoutExpiresAt,
      failedAt,
      failedReason: input.failedReason,
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

  if (booking.payment.paymentStatus === PaymentStatus.REFUNDED) {
    return {
      paymentId: booking.payment.id,
      bookingId,
      paymentStatus: booking.payment.paymentStatus,
    };
  }

  const refundedAt = new Date();

  const payment = await prisma.payment.update({
    where: {
      id: booking.payment.id,
    },
    data: {
      paymentStatus: PaymentStatus.REFUNDED,
      refundedAt,
      refundedAmount: input.refundedAmount,
      stripeRefundId: input.refundId,
      refundReason: input.refundReason,
    },
    select: {
      id: true,
      bookingId: true,
      paymentStatus: true,
    },
  });

  await prisma.booking.update({
    where: {
      id: bookingId,
    },
    data: {
      compensationResolutionType: "REFUND",
      compensationResolvedAt: refundedAt,
    },
  });

  if (booking.payment.creditAppliedAmount) {
    await issueClientCredit({
      clientId: booking.clientId,
      bookingId,
      paymentId: booking.payment.id,
      amount: booking.payment.creditAppliedAmount,
      currency: booking.payment.currency,
      notes: "Credit was restored to the client after the booking payment was refunded.",
      actorUserId: booking.clientId,
    });
  }

  return {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    paymentStatus: payment.paymentStatus,
  };
}
