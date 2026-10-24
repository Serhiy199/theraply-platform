import "server-only";
import { BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type AvailabilityTimeRange,
  buildDiscreteAvailabilitySlots,
} from "@/lib/google/google-slot-mapper";
import { DEFAULT_APP_TIME_ZONE } from "@/lib/time-zone";
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
const FREEBUSY_TIMEOUT_MS = 5_000;

function calendarUnavailable() {
  return new GoogleAvailabilityServiceError(
    "We could not verify calendar availability right now. Please try again.",
    "GOOGLE_CALENDAR_UNAVAILABLE",
  );
}

function parseBusyRanges(value: unknown): AvailabilityTimeRange[] {
  if (!value || typeof value !== "object") throw calendarUnavailable();
  const entry = value as { busy?: unknown; errors?: unknown };
  if (entry.errors !== undefined && (!Array.isArray(entry.errors) || entry.errors.length > 0)) {
    throw calendarUnavailable();
  }
  if (!Array.isArray(entry.busy)) throw calendarUnavailable();
  return entry.busy.map((range: unknown) => {
    if (!range || typeof range !== "object") throw calendarUnavailable();
    const { start, end } = range as { start?: unknown; end?: unknown };
    // Require RFC3339 offsets: never interpret a Google response in the server's local zone.
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    if (typeof start !== "string" || typeof end !== "string" || !timestamp.test(start) || !timestamp.test(end)) {
      throw calendarUnavailable();
    }
    for (const value of [start, end]) {
      const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
        throw calendarUnavailable();
      }
    }
    const startsAt = new Date(start);
    const endsAt = new Date(end);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw calendarUnavailable();
    }
    return { startsAt, endsAt };
  });
}

export type TherapistGoogleAvailabilitySlot = {
  therapistId: string;
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
  timeZone: string;
};

export class GoogleAvailabilityServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_DATE_RANGE"
      | "GOOGLE_CALENDAR_NOT_CONNECTED"
      | "GOOGLE_CALENDAR_UNAVAILABLE"
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
): Promise<{
  busyRanges: AvailabilityTimeRange[];
  timeZone: string;
}> {
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
        timeZone: DEFAULT_APP_TIME_ZONE,
        items: [{ id: connection.googleCalendarId }],
      },
    }, { timeout: FREEBUSY_TIMEOUT_MS, retry: false });

    const busyRanges = parseBusyRanges(response.data?.calendars?.[connection.googleCalendarId]);

    return {
      timeZone: DEFAULT_APP_TIME_ZONE,
      busyRanges,
    };
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
          "Google Calendar is not connected.",
          "GOOGLE_CALENDAR_NOT_CONNECTED",
        );
      }

      if (
        error.code === "GOOGLE_REFRESH_TOKEN_MISSING" ||
        error.code === "GOOGLE_CALENDAR_REAUTH_REQUIRED"
      ) {
        await createAuditLogEntryBestEffort({
          actorUserId: therapistId,
          entityType: "GoogleCalendarIntegration",
          entityId: therapistId,
          action: "GOOGLE_CALENDAR_AVAILABILITY_UNAVAILABLE",
          after: {
            from: from.toISOString(),
            to: to.toISOString(),
            reason: error.code,
          },
        });

        throw new GoogleAvailabilityServiceError(
          "Google Calendar authorization is unavailable.",
          "GOOGLE_CALENDAR_UNAVAILABLE",
        );
      }
    }

    logDiagnosticEvent("google-calendar-availability", "Unable to read Google Calendar freeBusy data.", {
      therapistId,
      from: from.toISOString(),
      to: to.toISOString(),
      code: "GOOGLE_CALENDAR_UNAVAILABLE",
    });
    await createAuditLogEntryBestEffort({
      actorUserId: therapistId,
      entityType: "GoogleCalendarIntegration",
      entityId: therapistId,
      action: "GOOGLE_CALENDAR_AVAILABILITY_READ_FAILED",
      after: {
        from: from.toISOString(),
        to: to.toISOString(),
        code: "GOOGLE_CALENDAR_UNAVAILABLE",
      },
    });

    throw calendarUnavailable();
  }
}

export async function hasTherapistGoogleCalendarBusyConflict(
  therapistId: string,
  startsAt: Date,
  endsAt: Date,
) {
  validateDateRange(startsAt, endsAt);

  const { busyRanges: googleBusyRanges } = await getGoogleCalendarBusyRanges(
    therapistId,
    startsAt,
    endsAt,
  );

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

  const [googleCalendarResult, localBusyRanges] = await Promise.all([
    getGoogleCalendarBusyRanges(therapistId, from, to),
    getLocalBookingBusyRanges(therapistId, from, to),
  ]);

  const { busyRanges: googleBusyRanges, timeZone } = googleCalendarResult;

  const slots = buildDiscreteAvailabilitySlots(
    [...googleBusyRanges, ...localBusyRanges],
    {
      from,
      to,
      slotDurationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
      businessHoursStart: BUSINESS_HOURS_START,
      businessHoursEnd: BUSINESS_HOURS_END,
      timeZone,
    },
  );

  return slots.map((slot) => ({
    therapistId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    isAvailable: slot.isAvailable,
    timeZone: slot.timeZone,
  }));
}
