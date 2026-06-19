import {
  BookingStatus,
  PaymentStatus,
  Prisma,
  SessionOutcome,
  SessionStatus,
  TherapistApprovalStatus,
  UserRole,
} from "@prisma/client";
import {
  bookingDetailsSelect,
  type BookingDetailsItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
import {
  GoogleAvailabilityServiceError,
  getTherapistGoogleAvailability,
  hasTherapistGoogleCalendarBusyConflict,
} from "@/server/services/google-availability.service";
import {
  BOOKING_FLOW_MESSAGES,
  BOOKING_FLOW_MIN_HOURS_BEFORE_SESSION,
} from "@/lib/constants/booking-flow";
import {
  createTherapistGoogleCalendarEvent,
  deleteTherapistGoogleCalendarEvent,
  GoogleCalendarServiceError,
} from "@/server/services/google-calendar.service";
import { getPaymentDueBy } from "@/server/services/payment-flow.service";
import {
  refundPlatformCancellationIfEligible,
  RefundServiceError,
} from "@/server/services/refund.service";
import {
  createTherapistTransferForBooking,
  type TherapistTransferResult,
} from "@/server/services/therapist-transfer.service";
import {
  sendBookingCancelledEmailsBestEffort,
  sendBookingConfirmedEmailBestEffort,
  sendBookingRejectedEmailBestEffort,
  sendBookingRequestCreatedEmailsBestEffort,
} from "@/server/services/transactional-email-events.service";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING_THERAPIST,
  BookingStatus.CONFIRMED,
] as const;

const bookableTherapistSelect = {
  id: true,
  email: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  therapistProfile: {
    select: {
      id: true,
      displayName: true,
      specialization: true,
      specialisation: true,
      bio: true,
      therapyServicesProvided: true,
      pricePerHour: true,
      sessionPricePence: true,
      googleCalendarId: true,
      googleCalendarEmail: true,
      isGoogleCalendarConnected: true,
      stripeAccountId: true,
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      approvalStatus: true,
      isApproved: true,
      onboardingCompleted: true,
    },
  },
} satisfies Prisma.UserSelect;

const bookableTherapistWhere = {
  role: UserRole.THERAPIST,
  isActive: true,
  emailVerified: true,
  therapistProfile: {
    is: {
      approvalStatus: TherapistApprovalStatus.APPROVED,
      isApproved: true,
      onboardingCompleted: true,
      stripeAccountId: {
        not: null,
      },
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
    },
  },
} satisfies Prisma.UserWhereInput;

export type BookableTherapist = Prisma.UserGetPayload<{
  select: typeof bookableTherapistSelect;
}>;

export type TherapistAvailabilitySlot = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
  timeZone: string;
  unavailableReason?: "conflict" | "lead_time";
};

export type CreateBookingRequestInput = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
};

export type TherapistSessionSettlementResult = {
  booking: BookingDetailsItem;
  transfer: TherapistTransferResult;
};

export class BookingFlowServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "BOOKING_NOT_CANCELLABLE"
      | "BOOKING_NOT_PENDING"
      | "BOOKING_LEAD_TIME"
      | "CLIENT_NOT_ELIGIBLE"
      | "INVALID_DATE_RANGE"
      | "INVALID_MEETING_URL"
      | "PAYMENT_NOT_SETTLED"
      | "REFUND_FAILED"
      | "SESSION_NOT_SETTLEABLE"
      | "SLOT_CONFLICT"
      | "THERAPIST_NOT_BOOKABLE"
      | "GOOGLE_CALENDAR_SYNC_FAILED",
  ) {
    super(message);
    this.name = "BookingFlowServiceError";
  }
}

function validateDateRange(startsAt: Date, endsAt: Date) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new BookingFlowServiceError("Booking start time is invalid.", "INVALID_DATE_RANGE");
  }

  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw new BookingFlowServiceError("Booking end time is invalid.", "INVALID_DATE_RANGE");
  }

  if (endsAt <= startsAt) {
    throw new BookingFlowServiceError(
      "Booking end time must be after the start time.",
      "INVALID_DATE_RANGE",
    );
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mergeNotes(existingNotes: string | null, extraNotes: string | null) {
  if (!extraNotes) {
    return existingNotes;
  }

  if (!existingNotes) {
    return extraNotes;
  }

  return `${existingNotes}\n\n${extraNotes}`;
}

function getMeetingBaseUrl() {
  const baseUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://theraply.local";

  try {
    return new URL(baseUrl).toString().replace(/\/$/, "");
  } catch {
    return "https://theraply.local";
  }
}

function buildGeneratedMeetingUrl(bookingId: string) {
  return `${getMeetingBaseUrl()}/sessions/${bookingId}`;
}

function getUserDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  const fullName = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(" ");
  return fullName || user.email?.trim() || null;
}

function buildBookingSlotLockKey(therapistId: string, startsAt: Date, endsAt: Date) {
  return `${therapistId}:${startsAt.toISOString()}:${endsAt.toISOString()}`;
}

function getMinimumBookingLeadTimeMs() {
  return BOOKING_FLOW_MIN_HOURS_BEFORE_SESSION * 60 * 60 * 1000;
}

function meetsBookingLeadTime(startsAt: Date, now = new Date()) {
  return startsAt.getTime() - now.getTime() >= getMinimumBookingLeadTimeMs();
}

function assertBookingLeadTime(startsAt: Date, now = new Date()) {
  if (!meetsBookingLeadTime(startsAt, now)) {
    throw new BookingFlowServiceError(
      BOOKING_FLOW_MESSAGES.minimumLeadTime,
      "BOOKING_LEAD_TIME",
    );
  }
}

async function acquireBookingSlotCreationLock(
  tx: Prisma.TransactionClient,
  therapistId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const lockKey = buildBookingSlotLockKey(therapistId, startsAt, endsAt);
  const lockResult = await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(
      hashtext(${therapistId}),
      hashtext(${lockKey})
    ) AS "locked"
  `;

  if (!lockResult[0]?.locked) {
    throw new BookingFlowServiceError(
      "The selected slot is being booked right now. Please try again.",
      "SLOT_CONFLICT",
    );
  }
}

async function getBookableTherapistOrThrow(therapistId: string) {
  const therapist = await prisma.user.findFirst({
    where: {
      ...bookableTherapistWhere,
      id: therapistId,
    },
    select: bookableTherapistSelect,
  });

  if (!therapist?.therapistProfile) {
    throw new BookingFlowServiceError(
      "Therapist is not available for booking.",
      "THERAPIST_NOT_BOOKABLE",
    );
  }

  return therapist;
}

async function assertClientCanBook(clientUserId: string) {
  const client = await prisma.user.findFirst({
    where: {
      id: clientUserId,
      role: UserRole.CLIENT,
      isActive: true,
      clientProfile: {
        isNot: null,
      },
    },
    select: {
      id: true,
    },
  });

  if (!client) {
    throw new BookingFlowServiceError(
      "Client account is not eligible to create bookings.",
      "CLIENT_NOT_ELIGIBLE",
    );
  }

  return client;
}

async function assertSlotIsAvailable(
  therapistId: string,
  startsAt: Date,
  endsAt: Date,
  excludeBookingId?: string,
) {
  const conflictingBooking = await prisma.booking.findFirst({
    where: {
      therapistId,
      bookingStatus: {
        in: [...ACTIVE_BOOKING_STATUSES],
      },
      NOT: excludeBookingId ? { id: excludeBookingId } : undefined,
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: {
      id: true,
    },
  });

  if (conflictingBooking) {
    throw new BookingFlowServiceError(
      "The selected slot is no longer available.",
      "SLOT_CONFLICT",
    );
  }
}

async function assertTherapistGoogleSlotIsAvailable(
  therapistId: string,
  startsAt: Date,
  endsAt: Date,
) {
  try {
    const hasGoogleConflict = await hasTherapistGoogleCalendarBusyConflict(
      therapistId,
      startsAt,
      endsAt,
    );

    if (hasGoogleConflict) {
      throw new BookingFlowServiceError(
        "The selected slot is no longer available.",
        "SLOT_CONFLICT",
      );
    }
  } catch (error) {
    if (error instanceof BookingFlowServiceError) {
      throw error;
    }

    if (error instanceof GoogleAvailabilityServiceError) {
      throw new BookingFlowServiceError(
        "The selected slot is no longer available.",
        "SLOT_CONFLICT",
      );
    }

    throw error;
  }
}

export async function getBookableTherapists(): Promise<BookableTherapist[]> {
  return prisma.user.findMany({
    where: bookableTherapistWhere,
    orderBy: [
      {
        therapistProfile: {
          displayName: "asc",
        },
      },
      {
        email: "asc",
      },
    ],
    select: bookableTherapistSelect,
  });
}

export async function getBookableTherapistById(
  therapistId: string,
): Promise<BookableTherapist> {
  return getBookableTherapistOrThrow(therapistId);
}

export async function getTherapistAvailability(
  therapistId: string,
  from?: Date,
  to?: Date,
): Promise<TherapistAvailabilitySlot[]> {
  await getBookableTherapistOrThrow(therapistId);
  if (from && to) {
    validateDateRange(from, to);
  }

  const now = new Date();
  const slots = await getTherapistGoogleAvailability(therapistId, from, to);

  return slots.map((slot) => {
    if (!slot.isAvailable) {
      return {
        ...slot,
        unavailableReason: "conflict" as const,
      };
    }

    if (!meetsBookingLeadTime(slot.startsAt, now)) {
      return {
        ...slot,
        isAvailable: false,
        unavailableReason: "lead_time" as const,
      };
    }

    return slot;
  });
}

export async function createBookingRequest(
  clientUserId: string,
  input: CreateBookingRequestInput,
): Promise<BookingDetailsItem> {
  await assertClientCanBook(clientUserId);
  await getBookableTherapistOrThrow(input.therapistId);
  validateDateRange(input.startsAt, input.endsAt);

  if (input.startsAt <= new Date()) {
    throw new BookingFlowServiceError(
      "Bookings must be scheduled in the future.",
      "INVALID_DATE_RANGE",
    );
  }

  assertBookingLeadTime(input.startsAt);

  const booking = await prisma.$transaction(async (tx) => {
    await acquireBookingSlotCreationLock(tx, input.therapistId, input.startsAt, input.endsAt);
    await assertSlotIsAvailable(input.therapistId, input.startsAt, input.endsAt);
    await assertTherapistGoogleSlotIsAvailable(input.therapistId, input.startsAt, input.endsAt);

    return tx.booking.create({
      data: {
        clientId: clientUserId,
        therapistId: input.therapistId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        bookingStatus: BookingStatus.PENDING_THERAPIST,
        notes: normalizeOptionalString(input.notes),
      },
      select: bookingDetailsSelect,
    });
  });

  await sendBookingRequestCreatedEmailsBestEffort(booking.id);

  return booking;
}

export async function confirmBookingRequest(
  therapistUserId: string,
  bookingId: string,
): Promise<BookingDetailsItem> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: therapistUserId,
    },
    select: {
      id: true,
      bookingStatus: true,
      startsAt: true,
      endsAt: true,
      therapistId: true,
      notes: true,
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
            },
          },
        },
      },
      session: {
        select: {
          id: true,
          sessionStatus: true,
          meetingUrl: true,
          googleCalendarEventId: true,
        },
      },
    },
  });

  if (!booking) {
    throw new BookingFlowServiceError(
      "Booking not found for this therapist.",
      "BOOKING_NOT_FOUND",
    );
  }

  if (booking.bookingStatus !== BookingStatus.PENDING_THERAPIST) {
    throw new BookingFlowServiceError(
      "Only pending therapist requests can be confirmed.",
      "BOOKING_NOT_PENDING",
    );
  }

  await assertSlotIsAvailable(booking.therapistId, booking.startsAt, booking.endsAt, booking.id);
  await assertTherapistGoogleSlotIsAvailable(booking.therapistId, booking.startsAt, booking.endsAt);

  const clientDisplayName = getUserDisplayName(booking.client);
  const therapistDisplayName =
    booking.therapist.therapistProfile?.displayName?.trim() ||
    getUserDisplayName(booking.therapist);

  let createdEvent:
    | Awaited<ReturnType<typeof createTherapistGoogleCalendarEvent>>
    | null = null;

  try {
    createdEvent = await createTherapistGoogleCalendarEvent({
      therapistUserId,
      bookingId: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      clientEmail: booking.client.email,
      clientDisplayName,
      therapistDisplayName,
      notes: booking.notes,
    });

    const confirmedEvent = createdEvent;

    const updatedBooking = await prisma.$transaction(async (tx) => {
      const generatedMeetingUrl =
        confirmedEvent.meetingUrl ||
        booking.session?.meetingUrl?.trim() ||
        buildGeneratedMeetingUrl(booking.id);

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: BookingStatus.CONFIRMED,
          paymentDueBy: getPaymentDueBy(booking.startsAt),
        },
      });

      if (booking.session?.id) {
        await tx.session.update({
          where: { id: booking.session.id },
          data: {
            sessionStatus: SessionStatus.SCHEDULED,
            meetingUrl: generatedMeetingUrl,
            googleCalendarEventId: confirmedEvent.eventId,
            googleCalendarConferenceId: confirmedEvent.conferenceId,
            googleCalendarEventHtmlLink: confirmedEvent.eventHtmlLink,
          },
        });
      } else {
        await tx.session.create({
          data: {
            bookingId: booking.id,
            sessionStatus: SessionStatus.SCHEDULED,
            meetingUrl: generatedMeetingUrl,
            googleCalendarEventId: confirmedEvent.eventId,
            googleCalendarConferenceId: confirmedEvent.conferenceId,
            googleCalendarEventHtmlLink: confirmedEvent.eventHtmlLink,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: therapistUserId,
          entityType: "Booking",
          entityId: booking.id,
          action: "THERAPIST_CONFIRM_BOOKING",
          before: {
            bookingStatus: booking.bookingStatus,
            sessionStatus: booking.session?.sessionStatus ?? null,
            paymentDueBy: null,
          },
          after: {
            bookingStatus: BookingStatus.CONFIRMED,
            sessionStatus: SessionStatus.SCHEDULED,
            paymentDueBy: getPaymentDueBy(booking.startsAt),
            googleCalendarEventId: confirmedEvent.eventId,
            meetingUrl: generatedMeetingUrl,
          },
        },
      });

      const updatedBooking = await tx.booking.findUnique({
        where: { id: booking.id },
        select: bookingDetailsSelect,
      });

      if (!updatedBooking) {
        throw new BookingFlowServiceError(
          "Booking not found after confirmation.",
          "BOOKING_NOT_FOUND",
        );
      }

      return updatedBooking;
    });

    await sendBookingConfirmedEmailBestEffort(updatedBooking.id);

    return updatedBooking;
  } catch (error) {
    if (createdEvent?.eventId) {
      try {
        await deleteTherapistGoogleCalendarEvent(therapistUserId, createdEvent.eventId);
      } catch {
        // Best effort rollback so we do not leave orphan Google events on failed confirmation.
      }
    }

    if (error instanceof BookingFlowServiceError) {
      throw error;
    }

    if (error instanceof GoogleCalendarServiceError) {
      throw new BookingFlowServiceError(error.message, "GOOGLE_CALENDAR_SYNC_FAILED");
    }

    throw error;
  }
}

export async function rejectBookingRequest(
  therapistUserId: string,
  bookingId: string,
  reason?: string | null,
): Promise<BookingDetailsItem> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: therapistUserId,
    },
    select: {
      id: true,
      bookingStatus: true,
      notes: true,
      therapistId: true,
      session: {
        select: {
          id: true,
          sessionStatus: true,
          meetingUrl: true,
          googleCalendarEventId: true,
        },
      },
    },
  });

  if (!booking) {
    throw new BookingFlowServiceError(
      "Booking not found for this therapist.",
      "BOOKING_NOT_FOUND",
    );
  }

  if (booking.bookingStatus !== BookingStatus.PENDING_THERAPIST) {
    throw new BookingFlowServiceError(
      "Only pending therapist requests can be rejected.",
      "BOOKING_NOT_PENDING",
    );
  }

  const reasonNote = normalizeOptionalString(reason)
    ? `Therapist rejection reason: ${normalizeOptionalString(reason)}`
    : null;

  if (booking.session?.googleCalendarEventId) {
    try {
      await deleteTherapistGoogleCalendarEvent(
        booking.therapistId,
        booking.session.googleCalendarEventId,
      );
    } catch (error) {
      if (error instanceof GoogleCalendarServiceError) {
        throw new BookingFlowServiceError(error.message, "GOOGLE_CALENDAR_SYNC_FAILED");
      }

      throw error;
    }
  }

  const updatedBooking = await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BookingStatus.REJECTED,
        notes: mergeNotes(booking.notes, reasonNote),
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
        actorUserId: therapistUserId,
        entityType: "Booking",
        entityId: booking.id,
        action: "THERAPIST_REJECT_BOOKING",
        before: {
          bookingStatus: booking.bookingStatus,
          sessionStatus: booking.session?.sessionStatus ?? null,
          notes: booking.notes,
        },
        after: {
          bookingStatus: BookingStatus.REJECTED,
          sessionStatus: booking.session?.id ? SessionStatus.CANCELLED : null,
          rejectionReason: normalizeOptionalString(reason),
        },
      },
    });

    const updatedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new BookingFlowServiceError(
        "Booking not found after rejection.",
        "BOOKING_NOT_FOUND",
      );
    }

    return updatedBooking;
  });

  await sendBookingRejectedEmailBestEffort(updatedBooking.id, {
    reason: normalizeOptionalString(reason),
  });

  return updatedBooking;
}

export async function cancelConfirmedBookingByTherapist(
  therapistUserId: string,
  bookingId: string,
): Promise<BookingDetailsItem> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: therapistUserId,
    },
    select: {
      id: true,
      bookingStatus: true,
      cancelledAt: true,
      cancelledByUserId: true,
      therapistId: true,
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
          amount: true,
          currency: true,
        },
      },
    },
  });

  if (!booking) {
    throw new BookingFlowServiceError(
      "Booking not found for this therapist.",
      "BOOKING_NOT_FOUND",
    );
  }

  if (booking.bookingStatus !== BookingStatus.CONFIRMED) {
    throw new BookingFlowServiceError(
      "Only confirmed sessions can be cancelled from the therapist area.",
      "BOOKING_NOT_CANCELLABLE",
    );
  }

  if (booking.session?.googleCalendarEventId) {
    try {
      await deleteTherapistGoogleCalendarEvent(
        therapistUserId,
        booking.session.googleCalendarEventId,
      );
    } catch (error) {
      if (error instanceof GoogleCalendarServiceError) {
        throw new BookingFlowServiceError(
          error.message,
          "GOOGLE_CALENDAR_SYNC_FAILED",
        );
      }

      throw error;
    }
  }

  const now = new Date();
  let refundResult: Awaited<ReturnType<typeof refundPlatformCancellationIfEligible>> = {
    status: "skipped",
    reason: "PAYMENT_NOT_FOUND",
    refundId: null,
    refundedAmount: null,
  };

  if (booking.payment?.paymentStatus === PaymentStatus.PAID) {
    try {
      refundResult = await refundPlatformCancellationIfEligible({
        bookingId: booking.id,
        actorUserId: therapistUserId,
        trigger: "THERAPIST_CANCELLATION",
        businessReason: "Therapist cancelled the confirmed paid session. A full refund is required.",
      });
    } catch (error) {
      if (error instanceof RefundServiceError) {
        throw new BookingFlowServiceError(error.message, "REFUND_FAILED");
      }

      throw error;
    }
  }

  const updatedBooking = await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: {
        id: booking.id,
      },
      data: {
        bookingStatus: BookingStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: therapistUserId,
      },
    });

    if (booking.session?.id && booking.session.sessionStatus !== SessionStatus.CANCELLED) {
      await tx.session.update({
        where: {
          id: booking.session.id,
        },
        data: {
          sessionStatus: SessionStatus.CANCELLED,
          meetingUrl: null,
          googleCalendarEventId: null,
          googleCalendarConferenceId: null,
          googleCalendarEventHtmlLink: null,
        },
      });
    }

    await createAuditLogEntryBestEffort({
      actorUserId: therapistUserId,
      entityType: "Booking",
      entityId: booking.id,
      action: "THERAPIST_CANCEL_BOOKING",
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
        cancelledByUserId: therapistUserId,
        sessionStatus: SessionStatus.CANCELLED,
        paymentStatus: booking.payment?.paymentStatus ?? null,
        refundStatus: refundResult.status,
        refundReason: refundResult.reason,
        refundId: refundResult.refundId,
      },
    });

    const updatedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new BookingFlowServiceError(
        "Booking not found after therapist cancellation.",
        "BOOKING_NOT_FOUND",
      );
    }

    return updatedBooking;
  });

  await sendBookingCancelledEmailsBestEffort(updatedBooking.id, {
    reason: "Cancelled by therapist.",
  });

  return updatedBooking;
}

export async function settleConfirmedSessionByTherapist(
  therapistUserId: string,
  bookingId: string,
  outcome: SessionOutcome,
): Promise<TherapistSessionSettlementResult> {
  const now = new Date();
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: therapistUserId,
    },
    select: {
      id: true,
      bookingStatus: true,
      startsAt: true,
      endsAt: true,
      therapistId: true,
      session: {
        select: {
          id: true,
          sessionStatus: true,
          outcome: true,
          completedAt: true,
        },
      },
      payment: {
        select: {
          id: true,
          paymentStatus: true,
          transferStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new BookingFlowServiceError(
      "Booking not found for this therapist.",
      "BOOKING_NOT_FOUND",
    );
  }

  if (
    booking.bookingStatus !== BookingStatus.CONFIRMED ||
    booking.session?.sessionStatus !== SessionStatus.SCHEDULED
  ) {
    throw new BookingFlowServiceError(
      "Only scheduled confirmed sessions can be completed or marked no-show.",
      "SESSION_NOT_SETTLEABLE",
    );
  }

  if (booking.endsAt > now) {
    throw new BookingFlowServiceError(
      "Sessions can only be completed after their scheduled end time.",
      "SESSION_NOT_SETTLEABLE",
    );
  }

  if (booking.payment?.paymentStatus !== PaymentStatus.PAID) {
    throw new BookingFlowServiceError(
      "Only paid sessions can be completed for therapist payout.",
      "PAYMENT_NOT_SETTLED",
    );
  }

  const updatedBooking = await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BookingStatus.COMPLETED,
      },
    });

    if (booking.session?.id) {
      await tx.session.update({
        where: { id: booking.session.id },
        data: {
          sessionStatus: SessionStatus.DONE,
          outcome,
          completedAt: now,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: therapistUserId,
        entityType: "Booking",
        entityId: booking.id,
        action:
          outcome === SessionOutcome.CLIENT_NO_SHOW
            ? "THERAPIST_MARK_CLIENT_NO_SHOW"
            : "THERAPIST_MARK_SESSION_COMPLETED",
        before: {
          bookingStatus: booking.bookingStatus,
          sessionStatus: booking.session?.sessionStatus ?? null,
          sessionOutcome: booking.session?.outcome ?? null,
          completedAt: booking.session?.completedAt ?? null,
          paymentStatus: booking.payment?.paymentStatus ?? null,
          transferStatus: booking.payment?.transferStatus ?? null,
        },
        after: {
          bookingStatus: BookingStatus.COMPLETED,
          sessionStatus: SessionStatus.DONE,
          sessionOutcome: outcome,
          completedAt: now,
          paymentStatus: booking.payment?.paymentStatus ?? null,
        },
      },
    });

    const settledBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!settledBooking) {
      throw new BookingFlowServiceError(
        "Booking not found after session settlement.",
        "BOOKING_NOT_FOUND",
      );
    }

    return settledBooking;
  });

  const transfer = await createTherapistTransferForBooking(booking.id, therapistUserId);

  return {
    booking: updatedBooking,
    transfer,
  };
}

export async function attachMeetingLinkToBooking(
  bookingId: string,
  meetingUrl: string,
): Promise<BookingDetailsItem> {
  const normalizedMeetingUrl = meetingUrl.trim();

  try {
    new URL(normalizedMeetingUrl);
  } catch {
    throw new BookingFlowServiceError(
      "Meeting link must be a valid absolute URL.",
      "INVALID_MEETING_URL",
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      session: {
        select: {
          id: true,
          meetingUrl: true,
        },
      },
    },
  });

  if (!booking) {
    throw new BookingFlowServiceError("Booking not found.", "BOOKING_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    if (booking.session?.id) {
      await tx.session.update({
        where: { id: booking.session.id },
        data: {
          meetingUrl: normalizedMeetingUrl,
          sessionStatus: SessionStatus.SCHEDULED,
        },
      });
    } else {
      await tx.session.create({
        data: {
          bookingId: booking.id,
          meetingUrl: normalizedMeetingUrl,
          sessionStatus: SessionStatus.SCHEDULED,
        },
      });
    }

    const updatedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new BookingFlowServiceError(
        "Booking not found after meeting link update.",
        "BOOKING_NOT_FOUND",
      );
    }

    return updatedBooking;
  });
}
