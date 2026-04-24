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
  payment: {
    select: {
      id: true,
      paymentStatus: true,
      paidAt: true,
      failedAt: true,
      refundedAt: true,
      checkoutExpiresAt: true,
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
      | "CHECKOUT_SESSION_CREATE_FAILED",
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
  checkoutUrl: string;
  sessionId: string;
  paymentId: string;
  amount: number;
  currency: string;
  expiresAt: Date | null;
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

function buildCheckoutLineItem(booking: StripeCheckoutBooking) {
  const therapistName = getTherapistCheckoutName(booking);
  const sessionDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(booking.startsAt);
  const unitAmount = booking.therapist.therapistProfile?.sessionPricePence;

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
  return {
    canPay,
    code,
    message,
    amount: booking.therapist.therapistProfile?.sessionPricePence ?? null,
    currency: PAYMENT_CURRENCY,
    paymentDueBy: booking.paymentDueBy ?? getPaymentDueBy(booking.startsAt),
    therapistSessionPricePence: booking.therapist.therapistProfile?.sessionPricePence ?? null,
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
  if (!isStripeConfigured()) {
    throw new PaymentFlowServiceError(
      "Stripe is not configured yet in this environment.",
      "STRIPE_NOT_CONFIGURED",
    );
  }

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

  const stripe = getStripeClient();
  const checkoutExpiresAt = buildStripeCheckoutExpiresAt(eligibility.paymentDueBy);

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: booking.client.email,
      client_reference_id: booking.id,
      line_items: [buildCheckoutLineItem(booking)],
      metadata: {
        bookingId: booking.id,
        clientUserId,
        therapistUserId: booking.therapistId,
      },
      payment_intent_data: {
        metadata: {
          bookingId: booking.id,
          clientUserId,
          therapistUserId: booking.therapistId,
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

    const payment = await prisma.payment.upsert({
      where: {
        bookingId: booking.id,
      },
      update: {
        amount: eligibility.amount,
        currency: eligibility.currency,
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null,
        checkoutExpiresAt,
        paidAt: null,
        failedAt: null,
        refundedAt: null,
        failedReason: null,
        refundReason: null,
        refundedAmount: null,
        creditAppliedAmount: null,
        stripeRefundId: null,
      },
      create: {
        bookingId: booking.id,
        amount: eligibility.amount,
        currency: eligibility.currency,
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId:
          typeof checkoutSession.payment_intent === "string"
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id ?? null,
        checkoutExpiresAt,
      },
      select: {
        id: true,
      },
    });

    return {
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      paymentId: payment.id,
      amount: eligibility.amount,
      currency: eligibility.currency,
      expiresAt: checkoutExpiresAt,
    };
  } catch (error) {
    if (error instanceof PaymentFlowServiceError) {
      throw error;
    }

    throw new PaymentFlowServiceError(
      error instanceof Error ? error.message : "Unable to create Stripe Checkout session.",
      "CHECKOUT_SESSION_CREATE_FAILED",
    );
  }
}
