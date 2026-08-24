import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTherapistGoogleCalendarEvent } from "@/server/services/google-calendar.service";

const therapistFindUniqueMock = vi.hoisted(() => vi.fn());
const eventInsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: {
      findUnique: therapistFindUniqueMock,
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/google/google-calendar-config", () => ({
  getGoogleOAuthScopeDiagnostics: vi.fn(),
  isGoogleCalendarConfigured: () => true,
}));

vi.mock("@/lib/google/google-oauth", () => ({
  buildGoogleOAuthConsentUrl: vi.fn(),
  createGoogleOAuthClient: () => ({}),
  exchangeGoogleAuthorizationCode: vi.fn(),
}));

vi.mock("@/lib/google/google-calendar", () => ({
  applyGoogleCalendarCredentials: vi.fn(),
  createGoogleCalendarClient: () => ({
    events: {
      insert: eventInsertMock,
    },
  }),
  getGoogleAuthenticatedUserProfile: vi.fn(),
  getGooglePrimaryCalendar: vi.fn(),
  listGoogleCalendars: vi.fn(),
  refreshGoogleAccessToken: vi.fn(),
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: vi.fn(),
  logDiagnosticEvent: vi.fn(),
}));

beforeEach(() => {
  therapistFindUniqueMock.mockResolvedValue({
    id: "profile-id",
    userId: "therapist-id",
    displayName: "Therapist User",
    googleCalendarId: "selected-calendar",
    googleCalendarEmail: "therapist@example.test",
    googleAccessToken: "access-token",
    googleRefreshToken: "refresh-token",
    googleTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    googleCalendarConnectedAt: new Date("2026-08-01T00:00:00.000Z"),
    isGoogleCalendarConnected: true,
    user: {
      id: "therapist-id",
      email: "therapist@example.test",
      firstName: "Therapist",
      lastName: "User",
    },
  });
  eventInsertMock.mockResolvedValue({
    data: {
      id: "event-id",
      htmlLink: "https://calendar.example.test/event-id",
      hangoutLink: "https://meet.example.test/meeting-id",
      conferenceData: {
        conferenceId: "meeting-id",
      },
    },
  });
});

describe("Google event absolute instant invariant", () => {
  it("sends the stored booking instants unchanged", async () => {
    const startsAt = new Date("2026-08-25T08:00:00.000Z");
    const endsAt = new Date("2026-08-25T09:00:00.000Z");

    await createTherapistGoogleCalendarEvent({
      therapistUserId: "therapist-id",
      bookingId: "booking-id",
      startsAt,
      endsAt,
      clientEmail: "client@example.test",
      clientDisplayName: "Client User",
      therapistDisplayName: "Therapist User",
    });

    expect(eventInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "selected-calendar",
        conferenceDataVersion: 1,
        requestBody: expect.objectContaining({
          start: { dateTime: "2026-08-25T08:00:00.000Z" },
          end: { dateTime: "2026-08-25T09:00:00.000Z" },
          conferenceData: expect.any(Object),
        }),
      }),
    );
    expect(startsAt.toISOString()).toBe("2026-08-25T08:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-08-25T09:00:00.000Z");
  });
});
