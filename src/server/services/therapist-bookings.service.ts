import {
  BookingStatus,
  SessionStatus,
  TherapistApprovalStatus,
} from "@prisma/client";
import {
  bookingDetailsSelect,
  therapistRequestItemSelect,
  type BookingDetailsItem,
  type TherapistRequestItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";

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
  sessionPricePence?: number | null;
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

export type TherapistPayoutDetailsView = {
  profile: {
    displayName: string | null;
    specialization: string | null;
    approvalStatus: TherapistApprovalStatus;
    sessionPricePence: number | null;
    googleCalendarId: string | null;
    googleCalendarEmail: string | null;
    isGoogleCalendarConnected: boolean;
    googleCalendarConnectedAt: Date | null;
    stripeAccountId: string | null;
    stripeOnboardingStatus: string;
    stripeChargesEnabled: boolean;
    stripePayoutsEnabled: boolean;
    stripeDetailsSubmitted: boolean;
    stripeOnboardingCompletedAt: Date | null;
    stripeAccountSyncedAt: Date | null;
    stripeDisabledReason: string | null;
  };
  payoutDetails: {
    id: string;
    accountHolderName: string;
    bankName: string | null;
    iban: string | null;
    swift: string | null;
    country: string | null;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null;
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
      displayName: true,
      specialization: true,
      approvalStatus: true,
      sessionPricePence: true,
      googleCalendarId: true,
      googleCalendarEmail: true,
      isGoogleCalendarConnected: true,
      googleCalendarConnectedAt: true,
      stripeAccountId: true,
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingCompletedAt: true,
      stripeAccountSyncedAt: true,
      stripeDisabledReason: true,
      payoutDetails: {
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
      },
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

export async function getTherapistUpcomingSessions(userId: string): Promise<TherapistRequestItem[]> {
  return prisma.booking.findMany({
    where: {
      therapistId: userId,
      bookingStatus: { in: [...therapistUpcomingBookingStatuses] },
      startsAt: { gte: getNow() },
    },
    orderBy: { startsAt: "asc" },
    select: therapistRequestItemSelect,
  });
}

export async function getTherapistPastSessions(userId: string): Promise<TherapistRequestItem[]> {
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
    select: therapistRequestItemSelect,
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

export async function getTherapistPayoutDetails(
  userId: string,
): Promise<TherapistPayoutDetailsView> {
  const therapistProfile = await getTherapistProfileOrThrow(userId);

  return {
    profile: {
      displayName: therapistProfile.displayName,
      specialization: therapistProfile.specialization,
      approvalStatus: therapistProfile.approvalStatus,
      sessionPricePence: therapistProfile.sessionPricePence,
      googleCalendarId: therapistProfile.googleCalendarId,
      googleCalendarEmail: therapistProfile.googleCalendarEmail,
      isGoogleCalendarConnected: therapistProfile.isGoogleCalendarConnected,
      googleCalendarConnectedAt: therapistProfile.googleCalendarConnectedAt,
      stripeAccountId: therapistProfile.stripeAccountId,
      stripeOnboardingStatus: therapistProfile.stripeOnboardingStatus,
      stripeChargesEnabled: therapistProfile.stripeChargesEnabled,
      stripePayoutsEnabled: therapistProfile.stripePayoutsEnabled,
      stripeDetailsSubmitted: therapistProfile.stripeDetailsSubmitted,
      stripeOnboardingCompletedAt: therapistProfile.stripeOnboardingCompletedAt,
      stripeAccountSyncedAt: therapistProfile.stripeAccountSyncedAt,
      stripeDisabledReason: therapistProfile.stripeDisabledReason,
    },
    payoutDetails: therapistProfile.payoutDetails,
  };
}

export async function updateTherapistPayoutDetails(
  userId: string,
  input: TherapistPayoutDetailsInput,
) {
  const therapistProfile = await getTherapistProfileOrThrow(userId);

  const normalizedAccountHolderName = input.accountHolderName.trim();

  const updatedPayoutDetails = await prisma.$transaction(async (tx) => {
    await tx.therapistProfile.update({
      where: {
        id: therapistProfile.id,
      },
      data: {
        sessionPricePence: input.sessionPricePence ?? null,
      },
    });

    const payoutDetails = await tx.therapistPayoutDetails.upsert({
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

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        entityType: "TherapistPayoutDetails",
        entityId: payoutDetails.id,
        action: "THERAPIST_PAYOUT_DETAILS_UPDATED",
        before: {
          therapistProfileId: therapistProfile.id,
          sessionPricePence: therapistProfile.sessionPricePence,
          payoutDetails: therapistProfile.payoutDetails
            ? {
                id: therapistProfile.payoutDetails.id,
                accountHolderName: therapistProfile.payoutDetails.accountHolderName,
                bankName: therapistProfile.payoutDetails.bankName,
                iban: therapistProfile.payoutDetails.iban,
                swift: therapistProfile.payoutDetails.swift,
                country: therapistProfile.payoutDetails.country,
                isVerified: therapistProfile.payoutDetails.isVerified,
              }
            : null,
        },
        after: {
          therapistProfileId: therapistProfile.id,
          sessionPricePence: input.sessionPricePence ?? null,
          payoutDetails: {
            id: payoutDetails.id,
            accountHolderName: payoutDetails.accountHolderName,
            bankName: payoutDetails.bankName,
            iban: payoutDetails.iban,
            swift: payoutDetails.swift,
            country: payoutDetails.country,
            isVerified: payoutDetails.isVerified,
          },
        },
      },
    });

    return payoutDetails;
  });

  await createAuditLogEntryBestEffort({
    actorUserId: userId,
    entityType: "TherapistProfile",
    entityId: therapistProfile.id,
    action: "THERAPIST_SESSION_PRICE_UPDATED",
    before: {
      sessionPricePence: therapistProfile.sessionPricePence,
    },
    after: {
      sessionPricePence: input.sessionPricePence ?? null,
    },
  });

  return updatedPayoutDetails;
}

export async function updateTherapistSessionPrice(
  userId: string,
  sessionPricePence: number | null,
) {
  const therapistProfile = await getTherapistProfileOrThrow(userId);

  const updatedProfile = await prisma.therapistProfile.update({
    where: {
      id: therapistProfile.id,
    },
    data: {
      sessionPricePence,
    },
    select: {
      id: true,
      sessionPricePence: true,
    },
  });

  await createAuditLogEntryBestEffort({
    actorUserId: userId,
    entityType: "TherapistProfile",
    entityId: therapistProfile.id,
    action: "THERAPIST_SESSION_PRICE_UPDATED",
    before: {
      sessionPricePence: therapistProfile.sessionPricePence,
    },
    after: {
      sessionPricePence,
    },
  });

  return updatedProfile;
}
