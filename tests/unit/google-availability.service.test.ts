import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTherapistGoogleAvailability, hasTherapistGoogleCalendarBusyConflict } from "@/server/services/google-availability.service";
import { GoogleCalendarServiceError, getAuthenticatedTherapistGoogleCalendarClient } from "@/server/services/google-calendar.service";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";

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
  GoogleCalendarServiceError: class GoogleCalendarServiceError extends Error {
    constructor(message: string, public code: string) { super(message); }
  },
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

describe("fail-closed Google FreeBusy", () => {
  it("accepts an explicitly empty busy list", async () => {
    await expect(hasTherapistGoogleCalendarBusyConflict("therapist-id", FROM, TO)).resolves.toBe(false);
  });

  it.each([
    null, {}, { calendars: {} }, { calendars: { "selected-calendar": null } },
    { calendars: { "selected-calendar": {} } },
    { calendars: { "selected-calendar": { busy: null } } },
    { calendars: { "selected-calendar": { busy: [], errors: [{ reason: "notFound" }] } } },
    { calendars: { "selected-calendar": { busy: [], errors: [{ reason: "internalError" }] } } },
    { calendars: { "selected-calendar": { busy: [], errors: "invalid" } } },
  ])("rejects incomplete/calendar-error response %#", async data => {
    freeBusyQueryMock.mockResolvedValueOnce({ data });
    await expect(hasTherapistGoogleCalendarBusyConflict("therapist-id", FROM, TO)).rejects.toMatchObject({ code: "GOOGLE_CALENDAR_UNAVAILABLE" });
  });

  it.each([
    null, {}, { start: "bad", end: "bad" },
    { start: "2026-08-25T09:00:00", end: "2026-08-25T10:00:00" },
    { start: "2026-08-25T09:00:00Z" },
    { start: "2026-08-25T09:00:00Z", end: "2026-08-25T09:00:00Z" },
    { start: "2026-08-25T10:00:00Z", end: "2026-08-25T09:00:00Z" },
    { start: "2026-02-30T09:00:00Z", end: "2026-02-30T10:00:00Z" },
    { start: "2026-08-25T24:00:00Z", end: "2026-08-26T01:00:00Z" },
  ])("rejects a malformed busy interval rather than silently dropping it %#", async interval => {
    freeBusyQueryMock.mockResolvedValueOnce({ data: { calendars: { "selected-calendar": { busy: [interval] } } } });
    await expect(hasTherapistGoogleCalendarBusyConflict("therapist-id", FROM, TO)).rejects.toMatchObject({ code: "GOOGLE_CALENDAR_UNAVAILABLE" });
  });

  it.each([429, 500, 503, "ETIMEDOUT", "ECONNRESET", 401, 403])("fails closed on %s without leaking provider error contents", async status => {
    freeBusyQueryMock.mockRejectedValueOnce(Object.assign(new Error("PRIVATE_TOKEN_SENTINEL"), { code: status }));
    await expect(hasTherapistGoogleCalendarBusyConflict("therapist-id", FROM, TO)).rejects.toMatchObject({ code: "GOOGLE_CALENDAR_UNAVAILABLE" });
    expect(JSON.stringify([vi.mocked(logDiagnosticEvent).mock.calls, vi.mocked(createAuditLogEntryBestEffort).mock.calls])).not.toContain("PRIVATE_TOKEN_SENTINEL");
  });

  it.each(["GOOGLE_CALENDAR_NOT_CONNECTED", "GOOGLE_REFRESH_TOKEN_MISSING", "GOOGLE_CALENDAR_REAUTH_REQUIRED"] as const)("fails closed on %s", async code => {
    vi.mocked(getAuthenticatedTherapistGoogleCalendarClient).mockRejectedValueOnce(new GoogleCalendarServiceError("PRIVATE_TOKEN_SENTINEL", code));
    await expect(hasTherapistGoogleCalendarBusyConflict("therapist-id", FROM, TO)).rejects.toMatchObject({ code: code === "GOOGLE_CALENDAR_NOT_CONNECTED" ? code : "GOOGLE_CALENDAR_UNAVAILABLE" });
    expect(freeBusyQueryMock).not.toHaveBeenCalled();
  });

  it("fails closed before requesting a missing target calendar", async () => {
    vi.mocked(getAuthenticatedTherapistGoogleCalendarClient).mockResolvedValueOnce({ connection: { googleCalendarId: null } } as never);
    await expect(hasTherapistGoogleCalendarBusyConflict("therapist-id", FROM, TO)).rejects.toMatchObject({ code: "GOOGLE_CALENDAR_TARGET_MISSING" });
    expect(freeBusyQueryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-10-24", "08:00:00.000Z"], ["2026-10-25", "09:00:00.000Z"],
    ["2026-03-28", "09:00:00.000Z"], ["2026-03-29", "08:00:00.000Z"],
  ])("keeps 09:00 London at the DST boundary on %s", async (day, utc) => {
    const from = new Date(`${day}T00:00:00Z`);
    const to = new Date(from.getTime() + 86_400_000);
    const slots = await getTherapistGoogleAvailability("therapist-id", from, to);
    expect(slots).toHaveLength(8);
    expect(slots[0].startsAt.toISOString()).toBe(`${day}T${utc}`);
    expect(slots.every(s => s.endsAt.getTime() - s.startsAt.getTime() === 3_600_000)).toBe(true);
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
      }, { timeout: 5_000, retry: false });
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
