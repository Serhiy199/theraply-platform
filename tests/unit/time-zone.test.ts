import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDateInTimeZone,
  getDateTimePartsInTimeZone,
} from "@/lib/google/google-time-zone";
import {
  DEFAULT_APP_TIME_ZONE,
  getTimeZoneDisplayLabel,
  isValidIanaTimeZone,
  resolveTimeZone,
} from "@/lib/time-zone";
import { formatAppDateTime } from "@/lib/utils/date-time";
import { bookingRequestSchema } from "@/lib/validations/booking-flow";

const PRODUCTION_INSTANT = new Date("2026-08-25T08:00:00.000Z");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("canonical application timezone", () => {
  it("uses Europe/London as the UK-first fallback", () => {
    expect(DEFAULT_APP_TIME_ZONE).toBe("Europe/London");
    expect(resolveTimeZone()).toBe(DEFAULT_APP_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(DEFAULT_APP_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_APP_TIME_ZONE);
    expect(getTimeZoneDisplayLabel()).toBe(DEFAULT_APP_TIME_ZONE);
  });

  it.each(["Europe/London", "Europe/Kyiv", "America/New_York", "UTC"])(
    "accepts the IANA timezone %s",
    (timeZone) => {
      expect(isValidIanaTimeZone(timeZone)).toBe(true);
      expect(resolveTimeZone(timeZone)).toBe(timeZone);
    },
  );

  it.each(["GMT+2", "UTC+3", "Europe/Fake", "London", ""])(
    "rejects the invalid timezone %s",
    (timeZone) => {
      expect(isValidIanaTimeZone(timeZone)).toBe(false);
      expect(resolveTimeZone(timeZone)).toBe(DEFAULT_APP_TIME_ZONE);
    },
  );

  it("falls back deterministically when both candidate and custom fallback are invalid", () => {
    expect(resolveTimeZone("Europe/Fake", "UTC+3")).toBe(DEFAULT_APP_TIME_ZONE);
  });
});

describe("absolute instant formatting", () => {
  it("renders the known production instant without mutating it", () => {
    const epochBefore = PRODUCTION_INSTANT.getTime();

    expect(formatAppDateTime(PRODUCTION_INSTANT, { timeZone: "Europe/London" }))
      .toContain("09:00");
    expect(formatAppDateTime(PRODUCTION_INSTANT, { timeZone: "Europe/Kyiv" }))
      .toContain("11:00");
    expect(formatAppDateTime(PRODUCTION_INSTANT, { timeZone: "UTC" }))
      .toContain("08:00");
    expect(PRODUCTION_INSTANT.getTime()).toBe(epochBefore);
  });

  it("preserves the previous Europe/London default", () => {
    expect(formatAppDateTime(PRODUCTION_INSTANT)).toBe(
      formatAppDateTime(PRODUCTION_INSTANT, { timeZone: "Europe/London" }),
    );
  });

  it("uses the UK fallback when a display timezone is invalid", () => {
    expect(formatAppDateTime(PRODUCTION_INSTANT, { timeZone: "Europe/Fake" })).toBe(
      formatAppDateTime(PRODUCTION_INSTANT, { timeZone: DEFAULT_APP_TIME_ZONE }),
    );
  });

  it("preserves the selected absolute instant through booking validation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T00:00:00.000Z"));

    const booking = bookingRequestSchema.parse({
      therapistId: "therapist-id",
      startsAt: "2026-08-25T08:00:00.000Z",
      endsAt: "2026-08-25T09:00:00.000Z",
    });

    expect(booking.startsAt.toISOString()).toBe("2026-08-25T08:00:00.000Z");
    expect(booking.endsAt.toISOString()).toBe("2026-08-25T09:00:00.000Z");
  });

  it.each(["UTC", "Europe/Kyiv", "America/New_York"])(
    "does not depend on the Node runtime timezone %s",
    (runtimeTimeZone) => {
      vi.stubEnv("TZ", runtimeTimeZone);

      expect(formatAppDateTime(PRODUCTION_INSTANT, { timeZone: "Europe/London" }))
        .toContain("09:00");
    },
  );

  it.each([
    ["London winter", "2026-01-15T09:00:00.000Z", "Europe/London", "09:00"],
    ["London summer", "2026-08-15T08:00:00.000Z", "Europe/London", "09:00"],
    ["Kyiv winter", "2026-01-15T09:00:00.000Z", "Europe/Kyiv", "11:00"],
    ["Kyiv summer", "2026-08-15T08:00:00.000Z", "Europe/Kyiv", "11:00"],
  ])("applies IANA winter/summer rules for %s", (_name, iso, timeZone, expectedTime) => {
    expect(formatAppDateTime(new Date(iso), { timeZone })).toContain(expectedTime);
  });
});

describe("current DST wall-clock conversion behavior", () => {
  it.each([
    ["London spring gap", "Europe/London", 2026, 3, 29, 1, 30, 2, 30],
    ["London autumn fold", "Europe/London", 2026, 10, 25, 1, 30, 1, 30],
    ["Kyiv spring gap", "Europe/Kyiv", 2026, 3, 29, 3, 30, 4, 30],
    ["Kyiv autumn fold", "Europe/Kyiv", 2026, 10, 25, 3, 30, 3, 30],
  ])(
    "documents %s without changing scheduling semantics",
    (_name, timeZone, year, month, day, hour, minute, expectedHour, expectedMinute) => {
      const instant = createDateInTimeZone(year, month, day, hour, minute, 0, timeZone);
      const roundTrip = getDateTimePartsInTimeZone(instant, timeZone);

      expect([roundTrip.hour, roundTrip.minute]).toEqual([expectedHour, expectedMinute]);
    },
  );
});
