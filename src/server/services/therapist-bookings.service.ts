import {
  BookingStatus,
  SessionStatus,
  type Prisma,
} from "@prisma/client";
import {
  bookingDetailsSelect,
  bookingListSelect,
  therapistRequestItemSelect,
  type BookingDetailsItem,
  type BookingListItem,
  type TherapistRequestItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";

const therapistUpcomingBookingStatuses = [BookingStatus.CONFIRMED] as const;
const therapistPastBookingStatuses = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.AUTO_CANCELLED,
  BookingStatus.REJECTED,
] as const;

export type TherapistPayoutDetailsInput = {
  accountHolderName: string;
  bankName?: string | null;
  iban?: string | null;
  swift?: string | null;
  country?: string | null;
};

export type TherapistClientListItem = {
  clientId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  firstBookingAt: Date;
  latestBookingAt: Date;
  totalBookings: number;
  upcomingBookings: number;
};

export class TherapistBookingsServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "BOOKING_NOT_PENDING"
      | "THERAPIST_PROFILE_NOT_FOUND",
  ) {
    super(message);
    this.name = "TherapistBookingsServiceError";
  }
}

function getNow() {
  return new Date();
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function getTherapistProfileOrThrow(userId: string) {
  const therapistProfile = await prisma.therapistProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!therapistProfile) {
    throw new TherapistBookingsServiceError(
      "Therapist profile not found for this account.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  return therapistProfile;
}

export async function getTherapistPendingRequests(userId: string): Promise<TherapistRequestItem[]> {
  return prisma.booking.findMany({
    where: {
      therapistId: userId,
      bookingStatus: BookingStatus.PENDING_THERAPIST,
    },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    select: therapistRequestItemSelect,
  });
}

export async function getTherapistUpcomingSessions(userId: string): Promise<BookingListItem[]> {
  return prisma.booking.findMany({
    where: {
      therapistId: userId,
      bookingStatus: { in: [...therapistUpcomingBookingStatuses] },
      startsAt: { gte: getNow() },
    },
    orderBy: { startsAt: "asc" },
    select: bookingListSelect,
  });
}

export async function getTherapistPastSessions(userId: string): Promise<BookingListItem[]> {
  const now = getNow();

  return prisma.booking.findMany({
    where: {
      therapistId: userId,
      OR: [
        { startsAt: { lt: now } },
        {
          bookingStatus: {
            in: [...therapistPastBookingStatuses],
          },
        },
      ],
    },
    orderBy: { startsAt: "desc" },
    select: bookingListSelect,
  });
}

export async function getTherapistClients(userId: string): Promise<TherapistClientListItem[]> {
  const now = getNow();
  const bookings = await prisma.booking.findMany({
    where: {
      therapistId: userId,
    },
    orderBy: {
      startsAt: "desc",
    },
    select: {
      id: true,
      startsAt: true,
      bookingStatus: true,
      client: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const clientsMap = new Map<string, TherapistClientListItem>();

  for (const booking of bookings) {
    const existing = clientsMap.get(booking.client.id);

    if (!existing) {
      clientsMap.set(booking.client.id, {
        clientId: booking.client.id,
        email: booking.client.email,
        firstName: booking.client.firstName,
        lastName: booking.client.lastName,
        firstBookingAt: booking.startsAt,
        latestBookingAt: booking.startsAt,
        totalBookings: 1,
        upcomingBookings:
          booking.bookingStatus === BookingStatus.CONFIRMED && booking.startsAt >= now ? 1 : 0,
      });

      continue;
    }

    existing.totalBookings += 1;

    if (booking.startsAt < existing.firstBookingAt) {
      existing.firstBookingAt = booking.startsAt;
    }

    if (booking.startsAt > existing.latestBookingAt) {
      existing.latestBookingAt = booking.startsAt;
    }

    if (booking.bookingStatus === BookingStatus.CONFIRMED && booking.startsAt >= now) {
      existing.upcomingBookings += 1;
    }
  }

  return Array.from(clientsMap.values()).sort(
    (left, right) => right.latestBookingAt.getTime() - left.latestBookingAt.getTime(),
  );
}

export async function getTherapistBookingById(
  userId: string,
  bookingId: string,
): Promise<BookingDetailsItem | null> {
  return prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: userId,
    },
    select: bookingDetailsSelect,
  });
}

export async function confirmTherapistBooking(
  userId: string,
  bookingId: string,
): Promise<BookingDetailsItem> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: userId,
    },
    select: {
      id: true,
      bookingStatus: true,
      session: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!booking) {
    throw new TherapistBookingsServiceError(
      "Booking not found for this therapist.",
      "BOOKING_NOT_FOUND",
    );
  }

  if (booking.bookingStatus !== BookingStatus.PENDING_THERAPIST) {
    throw new TherapistBookingsServiceError(
      "Only pending requests can be confirmed.",
      "BOOKING_NOT_PENDING",
    );
  }

  return prisma.$transaction(async (tx) => {
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
        },
      });
    } else {
      await tx.session.create({
        data: {
          bookingId: booking.id,
          sessionStatus: SessionStatus.SCHEDULED,
        },
      });
    }

    const updatedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new TherapistBookingsServiceError(
        "Booking not found after confirmation.",
        "BOOKING_NOT_FOUND",
      );
    }

    return updatedBooking;
  });
}

export async function rejectTherapistBooking(
  userId: string,
  bookingId: string,
): Promise<BookingDetailsItem> {
  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      therapistId: userId,
    },
    select: {
      id: true,
      bookingStatus: true,
      session: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!booking) {
    throw new TherapistBookingsServiceError(
      "Booking not found for this therapist.",
      "BOOKING_NOT_FOUND",
    );
  }

  if (booking.bookingStatus !== BookingStatus.PENDING_THERAPIST) {
    throw new TherapistBookingsServiceError(
      "Only pending requests can be rejected.",
      "BOOKING_NOT_PENDING",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BookingStatus.REJECTED,
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
      throw new TherapistBookingsServiceError(
        "Booking not found after rejection.",
        "BOOKING_NOT_FOUND",
      );
    }

    return updatedBooking;
  });
}

export async function updateTherapistPayoutDetails(
  userId: string,
  input: TherapistPayoutDetailsInput,
) {
  const therapistProfile = await getTherapistProfileOrThrow(userId);

  const normalizedAccountHolderName = input.accountHolderName.trim();

  return prisma.therapistPayoutDetails.upsert({
    where: {
      therapistProfileId: therapistProfile.id,
    },
    update: {
      accountHolderName: normalizedAccountHolderName,
      bankName: normalizeOptionalString(input.bankName),
      iban: normalizeOptionalString(input.iban),
      swift: normalizeOptionalString(input.swift),
      country: normalizeOptionalString(input.country),
    },
    create: {
      therapistProfileId: therapistProfile.id,
      accountHolderName: normalizedAccountHolderName,
      bankName: normalizeOptionalString(input.bankName),
      iban: normalizeOptionalString(input.iban),
      swift: normalizeOptionalString(input.swift),
      country: normalizeOptionalString(input.country),
    },
    select: {
      id: true,
      accountHolderName: true,
      bankName: true,
      iban: true,
      swift: true,
      country: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
