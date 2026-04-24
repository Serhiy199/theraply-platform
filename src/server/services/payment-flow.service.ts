import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PAYMENT_CURRENCY,
  PAYMENT_ELIGIBILITY_MESSAGES,
  PAYMENT_POLICY_HOURS_BEFORE_SESSION,
} from "@/lib/constants/payments";

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
    public readonly code: "BOOKING_NOT_FOUND" | "PAYMENT_NOT_ELIGIBLE",
  ) {
    super(message);
    this.name = "PaymentFlowServiceError";
  }
}

export function getPaymentDueBy(startsAt: Date) {
  return new Date(
    startsAt.getTime() - PAYMENT_POLICY_HOURS_BEFORE_SESSION * 60 * 60 * 1000,
  );
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
