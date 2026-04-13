import { BookingStatus, Prisma, SessionStatus, UserRole } from "@prisma/client";
import {
  bookingDetailsSelect,
  type BookingDetailsItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING_THERAPIST,
  BookingStatus.CONFIRMED,
] as const;

const DEFAULT_SLOT_DURATION_MINUTES = 60;
const DEFAULT_BOOKING_WINDOW_DAYS = 14;
const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 17;

const bookableTherapistSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  therapistProfile: {
    select: {
      id: true,
      displayName: true,
      specialization: true,
      bio: true,
      googleCalendarEmail: true,
      approvalStatus: true,
      isApproved: true,
    },
  },
} satisfies Prisma.UserSelect;

export type BookableTherapist = Prisma.UserGetPayload<{
  select: typeof bookableTherapistSelect;
}>;

export type TherapistAvailabilitySlot = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
};

export type CreateBookingRequestInput = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string | null;
};

export class BookingFlowServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "BOOKING_NOT_PENDING"
      | "CLIENT_NOT_ELIGIBLE"
      | "INVALID_DATE_RANGE"
      | "INVALID_MEETING_URL"
      | "SLOT_CONFLICT"
      | "THERAPIST_NOT_BOOKABLE",
  ) {
    super(message);
    this.name = "BookingFlowServiceError";
  }
}

function startOfHour(date: Date) {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getAvailabilityWindowStart() {
  const now = new Date();
  const rounded = startOfHour(now);
  return rounded > now ? rounded : addMinutes(rounded, DEFAULT_SLOT_DURATION_MINUTES);
}

function getAvailabilityWindowEnd(from: Date) {
  return addDays(from, DEFAULT_BOOKING_WINDOW_DAYS);
}

function overlaps(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
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

async function getBookableTherapistOrThrow(therapistId: string) {
  const therapist = await prisma.user.findFirst({
    where: {
      id: therapistId,
      role: UserRole.THERAPIST,
      isActive: true,
      therapistProfile: {
        isApproved: true,
      },
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

export async function getBookableTherapists(): Promise<BookableTherapist[]> {
  return prisma.user.findMany({
    where: {
      role: UserRole.THERAPIST,
      isActive: true,
      therapistProfile: {
        isApproved: true,
      },
    },
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
  from = getAvailabilityWindowStart(),
  to = getAvailabilityWindowEnd(from),
): Promise<TherapistAvailabilitySlot[]> {
  await getBookableTherapistOrThrow(therapistId);
  validateDateRange(from, to);

  const bookings = await prisma.booking.findMany({
    where: {
      therapistId,
      bookingStatus: {
        in: [...ACTIVE_BOOKING_STATUSES],
      },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: {
      startsAt: true,
      endsAt: true,
    },
    orderBy: {
      startsAt: "asc",
    },
  });

  const slots: TherapistAvailabilitySlot[] = [];
  let cursor = new Date(from);

  while (cursor < to) {
    const slotStart = new Date(cursor);
    const slotEnd = addMinutes(slotStart, DEFAULT_SLOT_DURATION_MINUTES);

    const withinBusinessHours =
      slotStart.getHours() >= BUSINESS_HOURS_START &&
      slotEnd.getHours() <= BUSINESS_HOURS_END &&
      slotEnd <= to;

    if (withinBusinessHours) {
      const isAvailable = !bookings.some((booking) =>
        overlaps(slotStart, slotEnd, booking.startsAt, booking.endsAt),
      );

      slots.push({
        therapistId,
        startsAt: slotStart,
        endsAt: slotEnd,
        isAvailable,
      });
    }

    cursor = addMinutes(cursor, DEFAULT_SLOT_DURATION_MINUTES);
  }

  return slots;
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

  await assertSlotIsAvailable(input.therapistId, input.startsAt, input.endsAt);

  const booking = await prisma.booking.create({
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
      session: {
        select: {
          id: true,
          meetingUrl: true,
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

  return prisma.$transaction(async (tx) => {
    const generatedMeetingUrl =
      booking.session?.meetingUrl?.trim() || buildGeneratedMeetingUrl(booking.id);

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BookingStatus.CONFIRMED,
      },
    });

    if (booking.session?.id) {
      await tx.session.update({
        where: { id: booking.session.id },
        data: {
          sessionStatus: SessionStatus.SCHEDULED,
          meetingUrl: generatedMeetingUrl,
        },
      });
    } else {
      await tx.session.create({
        data: {
          bookingId: booking.id,
          sessionStatus: SessionStatus.SCHEDULED,
          meetingUrl: generatedMeetingUrl,
        },
      });
    }

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
      session: {
        select: {
          id: true,
          meetingUrl: true,
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

  return prisma.$transaction(async (tx) => {
    const generatedMeetingUrl =
      booking.session?.meetingUrl?.trim() || buildGeneratedMeetingUrl(booking.id);

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
        },
      });
    }

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