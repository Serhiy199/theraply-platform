import { BookingStatus, PaymentStatus, SessionStatus } from "@prisma/client";
import {
  bookingDetailsSelect,
  bookingListSelect,
  paymentSummarySelect,
  type BookingDetailsItem,
  type BookingListItem,
  type PaymentSummaryItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
import {
  deleteTherapistGoogleCalendarEvent,
  GoogleCalendarServiceError,
} from "@/server/services/google-calendar.service";
import { issueClientCredit } from "@/server/services/client-credit.service";
import {
  refundClientCancellationIfEligible,
  refundPlatformCancellationIfEligible,
  RefundServiceError,
  type RefundExecutionResult,
} from "@/server/services/refund.service";
import { sendBookingCancelledEmailsBestEffort } from "@/server/services/transactional-email-events.service";

const upcomingClientBookingStatuses = [
  BookingStatus.PENDING_THERAPIST,
  BookingStatus.CONFIRMED,
] as const;

const cancellableClientBookingStatuses = [
  BookingStatus.PENDING_THERAPIST,
  BookingStatus.CONFIRMED,
] as const;

function isClientCancellableStatus(status: BookingStatus) {
  return cancellableClientBookingStatuses.some((allowedStatus) => allowedStatus === status);
}

export class ClientBookingsServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "BOOKING_NOT_CANCELLABLE"
      | "COMPENSATION_ALREADY_RESOLVED"
      | "COMPENSATION_NOT_ELIGIBLE"
      | "GOOGLE_CALENDAR_SYNC_FAILED"
      | "REFUND_FAILED",
  ) {
    super(message);
    this.name = "ClientBookingsServiceError";
  }
}

export type ClientBookingCancellationResult = {
  booking: BookingDetailsItem;
  refund: RefundExecutionResult;
};

export type ClientCompensationResolutionResult = {
  booking: BookingDetailsItem;
  resolution: "refund" | "credit";
  refund: RefundExecutionResult | null;
  issuedCreditAmount: number | null;
};

function getNow() {
  return new Date();
}

export async function getClientUpcomingBookings(userId: string): Promise<BookingListItem[]> {
  return prisma.booking.findMany({
    where: {
      clientId: userId,
      bookingStatus: { in: [...upcomingClientBookingStatuses] },
      startsAt: { gte: getNow() },
    },
    orderBy: {
      startsAt: "asc",
    },
    select: bookingListSelect,
  });
}

export async function getClientPastBookings(userId: string): Promise<BookingListItem[]> {
  const now = getNow();

  return prisma.booking.findMany({
    where: {
      clientId: userId,
      OR: [
        { startsAt: { lt: now } },
        {
          bookingStatus: {
            in: [
              BookingStatus.REJECTED,
              BookingStatus.CANCELLED,
              BookingStatus.AUTO_CANCELLED,
              BookingStatus.COMPLETED,
            ],
          },
        },
      ],
    },
    orderBy: {
      startsAt: "desc",
    },
    select: bookingListSelect,
  });
}

export async function getClientBookingById(
  userId: string,
  bookingId: string,
): Promise<BookingDetailsItem | null> {
  return prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId: userId,
    },
    select: bookingDetailsSelect,
  });
}

export async function getClientPayments(userId: string): Promise<PaymentSummaryItem[]> {
  return prisma.payment.findMany({
    where: {
      booking: {
        clientId: userId,
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { paidAt: "desc" },
    ],
    select: paymentSummarySelect,
  });
}

export async function cancelClientBooking(
  userId: string,
  bookingId: string,
): Promise<ClientBookingCancellationResult> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId: userId,
    },
    select: {
      id: true,
      bookingStatus: true,
      startsAt: true,
      therapistId: true,
      cancelledAt: true,
      cancelledByUserId: true,
      session: {
        select: {
          id: true,
          sessionStatus: true,
          googleCalendarEventId: true,
        },
      },
      payment: {
        select: {
          id: true,
          paymentStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new ClientBookingsServiceError("Booking not found for this client.", "BOOKING_NOT_FOUND");
  }

  const now = getNow();
  const canCancel = isClientCancellableStatus(booking.bookingStatus) && booking.startsAt > now;

  if (!canCancel) {
    throw new ClientBookingsServiceError(
      "Booking can no longer be cancelled by the client.",
      "BOOKING_NOT_CANCELLABLE",
    );
  }

  if (booking.session?.googleCalendarEventId) {
    try {
      await deleteTherapistGoogleCalendarEvent(
        booking.therapistId,
        booking.session.googleCalendarEventId,
      );
    } catch (error) {
      if (error instanceof GoogleCalendarServiceError) {
        throw new ClientBookingsServiceError(error.message, "GOOGLE_CALENDAR_SYNC_FAILED");
      }

      throw error;
    }
  }

  let refund: RefundExecutionResult = {
    status: "skipped",
    reason: "PAYMENT_NOT_FOUND",
    refundId: null,
    refundedAmount: null,
  };

  try {
    refund = await refundClientCancellationIfEligible(booking.id, userId);
  } catch (error) {
    if (error instanceof RefundServiceError) {
      throw new ClientBookingsServiceError(error.message, "REFUND_FAILED");
    }

    throw error;
  }

  const cancellationResult = await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BookingStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: userId,
      },
    });

    if (booking.session?.id) {
      await tx.session.update({
        where: { id: booking.session.id },
        data: {
          sessionStatus: SessionStatus.CANCELLED,
          meetingUrl: null,
          googleCalendarEventId: null,
          googleCalendarConferenceId: null,
          googleCalendarEventHtmlLink: null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        entityType: "Booking",
        entityId: booking.id,
        action: "CLIENT_CANCEL_BOOKING",
        before: {
          bookingStatus: booking.bookingStatus,
          cancelledAt: booking.cancelledAt,
          cancelledByUserId: booking.cancelledByUserId,
          sessionStatus: booking.session?.sessionStatus ?? null,
          paymentStatus: booking.payment?.paymentStatus ?? null,
        },
        after: {
          bookingStatus: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: userId,
          sessionStatus: SessionStatus.CANCELLED,
          paymentStatus: booking.payment?.paymentStatus ?? null,
          refundStatus: refund.status,
          refundReason: refund.reason,
          refundId: refund.refundId,
        },
      },
    });

    const updatedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new ClientBookingsServiceError("Booking not found after update.", "BOOKING_NOT_FOUND");
    }

    return {
      booking: updatedBooking,
      refund,
    };
  });

  await sendBookingCancelledEmailsBestEffort(cancellationResult.booking.id, {
    reason: "Cancelled by client.",
  });

  return cancellationResult;
}

export async function resolveClientCancellationCompensation(
  userId: string,
  bookingId: string,
  resolution: "refund" | "credit",
): Promise<ClientCompensationResolutionResult> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId: userId,
    },
    select: {
      id: true,
      clientId: true,
      therapistId: true,
      bookingStatus: true,
      cancelledByUserId: true,
      compensationResolutionType: true,
      payment: {
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new ClientBookingsServiceError("Booking not found for this client.", "BOOKING_NOT_FOUND");
  }

  if (booking.compensationResolutionType) {
    throw new ClientBookingsServiceError(
      "Compensation has already been resolved for this booking.",
      "COMPENSATION_ALREADY_RESOLVED",
    );
  }

  const compensationChoiceAvailable =
    booking.bookingStatus === BookingStatus.CANCELLED &&
    booking.cancelledByUserId === booking.therapistId &&
    booking.payment?.paymentStatus === PaymentStatus.PAID;

  if (!compensationChoiceAvailable || !booking.payment) {
    throw new ClientBookingsServiceError(
      "Compensation choice is not available for this booking.",
      "COMPENSATION_NOT_ELIGIBLE",
    );
  }

  if (resolution === "refund") {
    let refund: RefundExecutionResult;

    try {
      refund = await refundPlatformCancellationIfEligible({
        bookingId: booking.id,
        actorUserId: userId,
        trigger: "THERAPIST_CANCELLATION",
        businessReason:
          "Client chose a full refund after the therapist cancelled the confirmed session.",
      });
    } catch (error) {
      if (error instanceof RefundServiceError) {
        throw new ClientBookingsServiceError(error.message, "REFUND_FAILED");
      }

      throw error;
    }

    const updatedBooking = await prisma.booking.findUnique({
      where: {
        id: booking.id,
      },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new ClientBookingsServiceError("Booking not found after update.", "BOOKING_NOT_FOUND");
    }

    return {
      booking: updatedBooking,
      resolution: "refund",
      refund,
      issuedCreditAmount: null,
    };
  }

  const issuedCreditAmount = await issueClientCredit({
    clientId: userId,
    bookingId: booking.id,
    paymentId: booking.payment.id,
    amount: booking.payment.amount,
    currency: booking.payment.currency,
    notes:
      "Client chose platform credit after the therapist cancelled the confirmed session.",
    actorUserId: userId,
  });

  const updatedBooking = await prisma.booking.update({
    where: {
      id: booking.id,
    },
    data: {
      compensationResolutionType: "CREDIT",
      compensationResolvedAt: new Date(),
    },
    select: bookingDetailsSelect,
  });

  await createAuditLogEntryBestEffort({
    actorUserId: userId,
    entityType: "Booking",
    entityId: booking.id,
    action: "CLIENT_COMPENSATION_CREDIT_SELECTED",
    before: {
      compensationResolutionType: booking.compensationResolutionType,
      paymentStatus: booking.payment.paymentStatus,
    },
    after: {
      compensationResolutionType: "CREDIT",
      issuedCreditAmount,
      currency: booking.payment.currency,
    },
  });

  return {
    booking: updatedBooking,
    resolution: "credit",
    refund: null,
    issuedCreditAmount,
  };
}
