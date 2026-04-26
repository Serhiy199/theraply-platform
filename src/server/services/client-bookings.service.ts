import { BookingStatus, SessionStatus } from "@prisma/client";
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
      session: {
        select: {
          id: true,
          googleCalendarEventId: true,
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

  return prisma.$transaction(async (tx) => {
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
}

