import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTherapistGoogleAvailability } from "@/server/services/google-availability.service";

const bookingFindManyMock = vi.hoisted(() => vi.fn());
const freeBusyQueryMock = vi.hoisted(() => vi.fn());
const selectedCalendarTimeZoneMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findMany: bookingFindManyMock,
    },
  },
}));

vi.mock("@/server/services/google-calendar.service", () => ({
  GoogleCalendarServiceError: class GoogleCalendarServiceError extends Error {},
  getAuthenticatedTherapistGoogleCalendarClient: vi.fn().mockResolvedValue({
    connection: {
      googleCalendarId: "selected-calendar",
    },
    calendar: {
      freebusy: {
        query: freeBusyQueryMock,
      },
    },
  }),
  getTherapistSelectedGoogleCalendarTimeZone: selectedCalendarTimeZoneMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: vi.fn(),
  logDiagnosticEvent: vi.fn(),
}));

const FROM = new Date("2026-08-25T00:00:00.000Z");
const TO = new Date("2026-08-26T00:00:00.000Z");

beforeEach(() => {
  bookingFindManyMock.mockResolvedValue([]);
  freeBusyQueryMock.mockResolvedValue({
    data: {
      calendars: {
        "selected-calendar": {
          busy: [],
        },
      },
    },
  });
});

describe("UK-only Google availability", () => {
  it.each(["Europe/London", "Europe/Kyiv", "America/New_York"])(
    "keeps 09:00-17:00 London when the selected Google calendar uses %s",
    async (calendarTimeZone) => {
      selectedCalendarTimeZoneMock.mockResolvedValue(calendarTimeZone);

      const slots = await getTherapistGoogleAvailability("therapist-id", FROM, TO);

      expect(selectedCalendarTimeZoneMock).not.toHaveBeenCalled();
      expect(freeBusyQueryMock).toHaveBeenCalledWith({
        requestBody: {
          timeMin: FROM.toISOString(),
          timeMax: TO.toISOString(),
          timeZone: "Europe/London",
          items: [{ id: "selected-calendar" }],
        },
      });
      expect(slots).toHaveLength(8);
      expect(slots[0]).toMatchObject({
        startsAt: new Date("2026-08-25T08:00:00.000Z"),
        endsAt: new Date("2026-08-25T09:00:00.000Z"),
        timeZone: "Europe/London",
        isAvailable: true,
      });
      expect(slots.at(-1)).toMatchObject({
        startsAt: new Date("2026-08-25T15:00:00.000Z"),
        endsAt: new Date("2026-08-25T16:00:00.000Z"),
        timeZone: "Europe/London",
      });
    },
  );

  it("compares Google busy ranges with London candidates as absolute instants", async () => {
    freeBusyQueryMock.mockResolvedValue({
      data: {
        calendars: {
          "selected-calendar": {
            busy: [
              {
                start: "2026-08-25T08:00:00.000Z",
                end: "2026-08-25T09:00:00.000Z",
              },
            ],
          },
        },
      },
    });

    const slots = await getTherapistGoogleAvailability("therapist-id", FROM, TO);

    expect(slots[0]).toMatchObject({
      startsAt: new Date("2026-08-25T08:00:00.000Z"),
      isAvailable: false,
    });
    expect(slots[1].isAvailable).toBe(true);
  });
});
