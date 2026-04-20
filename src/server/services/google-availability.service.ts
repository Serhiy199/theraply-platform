import "server-only";
import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type AvailabilityTimeRange,
  buildDiscreteAvailabilitySlots,
} from "@/lib/google/google-slot-mapper";
import {
  GoogleCalendarServiceError,
  getAuthenticatedTherapistGoogleCalendarClient,
} from "@/server/services/google-calendar.service";
import {
  createAuditLogEntryBestEffort,
  logDiagnosticEvent,
} from "@/server/services/audit-log.service";

const ACTIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING_THERAPIST,
  BookingStatus.CONFIRMED,
] as const;

const DEFAULT_SLOT_DURATION_MINUTES = 60;
const DEFAULT_BOOKING_WINDOW_DAYS = 14;
const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 17;

export type TherapistGoogleAvailabilitySlot = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
};

export class GoogleAvailabilityServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_DATE_RANGE"
      | "GOOGLE_CALENDAR_NOT_CONNECTED"
      | "GOOGLE_CALENDAR_TARGET_MISSING",
  ) {
    super(message);
    this.name = "GoogleAvailabilityServiceError";
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

function rangesOverlap(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

export function getGoogleAvailabilityWindowStart() {
  const now = new Date();
  const rounded = startOfHour(now);
  return rounded > now ? rounded : addMinutes(rounded, DEFAULT_SLOT_DURATION_MINUTES);
}

export function getGoogleAvailabilityWindowEnd(from: Date) {
  return addDays(from, DEFAULT_BOOKING_WINDOW_DAYS);
}

function validateDateRange(startsAt: Date, endsAt: Date) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new GoogleAvailabilityServiceError(
      "Availability start time is invalid.",
      "INVALID_DATE_RANGE",
    );
  }

  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw new GoogleAvailabilityServiceError(
      "Availability end time is invalid.",
      "INVALID_DATE_RANGE",
    );
  }

  if (endsAt <= startsAt) {
    throw new GoogleAvailabilityServiceError(
      "Availability end time must be after the start time.",
      "INVALID_DATE_RANGE",
    );
  }
}

async function getLocalBookingBusyRanges(
  therapistId: string,
  from: Date,
  to: Date,
): Promise<AvailabilityTimeRange[]> {
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

  return bookings.map((booking) => ({
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
  }));
}

async function getGoogleCalendarBusyRanges(
  therapistId: string,
  from: Date,
  to: Date,
): Promise<AvailabilityTimeRange[]> {
  try {
    const { connection, calendar } = await getAuthenticatedTherapistGoogleCalendarClient(therapistId);

    if (!connection.googleCalendarId) {
      await createAuditLogEntryBestEffort({
        actorUserId: therapistId,
        entityType: "GoogleCalendarIntegration",
        entityId: therapistId,
        action: "GOOGLE_CALENDAR_AVAILABILITY_TARGET_MISSING",
        after: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
      });

      throw new GoogleAvailabilityServiceError(
        "No target Google Calendar is selected for this therapist.",
        "GOOGLE_CALENDAR_TARGET_MISSING",
      );
    }

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: connection.googleCalendarId }],
      },
    });

    const busyRanges =
      response.data.calendars?.[connection.googleCalendarId]?.busy ?? [];

    return busyRanges
      .map((range) => {
        const startsAt = range.start ? new Date(range.start) : null;
        const endsAt = range.end ? new Date(range.end) : null;

        if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
          return null;
        }

        return {
          startsAt,
          endsAt,
        };
      })
      .filter((range): range is AvailabilityTimeRange => Boolean(range));
  } catch (error) {
    if (error instanceof GoogleAvailabilityServiceError) {
      throw error;
    }

    if (error instanceof GoogleCalendarServiceError) {
      if (error.code === "GOOGLE_CALENDAR_NOT_CONNECTED") {
        await createAuditLogEntryBestEffort({
          actorUserId: therapistId,
          entityType: "GoogleCalendarIntegration",
          entityId: therapistId,
          action: "GOOGLE_CALENDAR_AVAILABILITY_NOT_CONNECTED",
          after: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
        });

        throw new GoogleAvailabilityServiceError(
          error.message,
          "GOOGLE_CALENDAR_NOT_CONNECTED",
        );
      }
    }

    logDiagnosticEvent("google-calendar-availability", "Unable to read Google Calendar freeBusy data.", {
      therapistId,
      from: from.toISOString(),
      to: to.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    await createAuditLogEntryBestEffort({
      actorUserId: therapistId,
      entityType: "GoogleCalendarIntegration",
      entityId: therapistId,
      action: "GOOGLE_CALENDAR_AVAILABILITY_READ_FAILED",
      after: {
        from: from.toISOString(),
        to: to.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

export async function hasTherapistGoogleCalendarBusyConflict(
  therapistId: string,
  startsAt: Date,
  endsAt: Date,
) {
  validateDateRange(startsAt, endsAt);

  const googleBusyRanges = await getGoogleCalendarBusyRanges(therapistId, startsAt, endsAt);

  return googleBusyRanges.some((range) =>
    rangesOverlap(startsAt, endsAt, range.startsAt, range.endsAt),
  );
}

export async function getTherapistGoogleAvailability(
  therapistId: string,
  from = getGoogleAvailabilityWindowStart(),
  to = getGoogleAvailabilityWindowEnd(from),
): Promise<TherapistGoogleAvailabilitySlot[]> {
  validateDateRange(from, to);

  const [googleBusyRanges, localBusyRanges] = await Promise.all([
    getGoogleCalendarBusyRanges(therapistId, from, to),
    getLocalBookingBusyRanges(therapistId, from, to),
  ]);

  const slots = buildDiscreteAvailabilitySlots(
    [...googleBusyRanges, ...localBusyRanges],
    {
      from,
      to,
      slotDurationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
      businessHoursStart: BUSINESS_HOURS_START,
      businessHoursEnd: BUSINESS_HOURS_END,
    },
  );

  return slots.map((slot) => ({
    therapistId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    isAvailable: slot.isAvailable,
  }));
}
