import { BookingStatus, PaymentStatus, PaymentTransferStatus, SessionStatus } from "@prisma/client";
import {
  bookingDetailsSelect,
  bookingListSelect,
  paymentSummarySelect,
  type BookingDetailsItem,
  type BookingListItem,
  type PaymentSummaryItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";
import {
  deleteTherapistGoogleCalendarEvent,
  GoogleCalendarServiceError,
} from "@/server/services/google-calendar.service";
import {
  refundClientCancellationIfEligible,
  RefundServiceError,
  type RefundExecutionResult,
} from "@/server/services/refund.service";
import {
  createTherapistTransferForBooking,
  TherapistTransferServiceError,
  type TherapistTransferResult,
} from "@/server/services/therapist-transfer.service";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
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

function getAuditPaymentStatusAfterClientCancellation(
  currentStatus: PaymentStatus | null | undefined,
  refund: RefundExecutionResult,
) {
  if (refund.status === "refunded" || refund.reason === "ALREADY_REFUNDED") {
    return PaymentStatus.REFUNDED;
  }

  return currentStatus ?? null;
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
  transfer: TherapistTransferResult | null;
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

function shouldSettleLateClientCancellation(
  paymentStatus: PaymentStatus | null | undefined,
  refund: RefundExecutionResult,
) {
  return paymentStatus === PaymentStatus.PAID && refund.reason === "LATE_CANCELLATION_POLICY";
}

function getClientCancellationEmailReason(shouldSettleTransfer: boolean) {
  return shouldSettleTransfer
    ? "Late client cancellation: payment is non-refundable under policy."
    : "Cancelled by client.";
}

async function createLateCancellationTransferBestEffort(
  bookingId: string,
  paymentId: string | null,
  actorUserId: string,
): Promise<TherapistTransferResult> {
  try {
    return await createTherapistTransferForBooking(bookingId, actorUserId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    logDiagnosticEvent(
      "client-bookings",
      "Unable to start late client cancellation therapist transfer.",
      {
        bookingId,
        paymentId,
        error: reason,
      },
    );

    if (paymentId) {
      try {
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            transferStatus: PaymentTransferStatus.FAILED,
            transferFailedAt: new Date(),
            transferFailureReason: reason,
          },
        });
      } catch (updateError) {
        logDiagnosticEvent(
          "client-bookings",
          "Unable to mark late client cancellation therapist transfer as failed.",
          {
            bookingId,
            paymentId,
            error: updateError instanceof Error ? updateError.message : String(updateError),
          },
        );
      }
    }

    await createAuditLogEntryBestEffort({
      actorUserId,
      entityType: "Payment",
      entityId: paymentId ?? bookingId,
      action: "LATE_CLIENT_CANCELLATION_TRANSFER_FAILED",
      after: {
        bookingId,
        paymentId,
        settlementReason: "LATE_CLIENT_CANCELLATION",
        error: reason,
      },
    });

    if (error instanceof TherapistTransferServiceError) {
      return {
        status: "failed",
        bookingId,
        paymentId,
        reason: error.message,
      };
    }

    return {
      status: "failed",
      bookingId,
      paymentId,
      reason,
    };
  }
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
    const shouldSettleTransfer = shouldSettleLateClientCancellation(
      booking.payment?.paymentStatus,
      refund,
    );

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
          paymentStatus: getAuditPaymentStatusAfterClientCancellation(
            booking.payment?.paymentStatus,
            refund,
          ),
          refundStatus: refund.status,
          refundReason: refund.reason,
          refundId: refund.refundId,
          transferExpected: shouldSettleTransfer,
          transferReason: shouldSettleTransfer ? "LATE_CLIENT_CANCELLATION" : null,
          transferStatus: shouldSettleTransfer ? "PENDING" : null,
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
      transfer: null,
    };
  });

  const shouldSettleTransfer = shouldSettleLateClientCancellation(
    booking.payment?.paymentStatus,
    refund,
  );

  const transfer = shouldSettleTransfer
    ? await createLateCancellationTransferBestEffort(
        booking.id,
        booking.payment?.id ?? null,
        userId,
      )
    : null;

  await sendBookingCancelledEmailsBestEffort(cancellationResult.booking.id, {
    reason: getClientCancellationEmailReason(shouldSettleTransfer),
  });

  return {
    ...cancellationResult,
    transfer,
  };
}

export async function resolveClientCancellationCompensation(
  userId: string,
  bookingId: string,
  _resolution: "refund" | "credit",
): Promise<ClientCompensationResolutionResult> {
  void _resolution;

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      clientId: userId,
    },
    select: {
      id: true,
      bookingStatus: true,
      compensationResolutionType: true,
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

  throw new ClientBookingsServiceError(
    "Therapist cancellation compensation choice is no longer available because therapist cancellations are refunded automatically.",
    "COMPENSATION_NOT_ELIGIBLE",
  );
}
