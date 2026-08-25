import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeTherapistGoogleCalendarConnection,
  getTherapistSelectedGoogleCalendarTimeZone,
} from "@/server/services/google-calendar.service";

const exchangeCodeMock = vi.hoisted(() => vi.fn());
const getProfileMock = vi.hoisted(() => vi.fn());
const getPrimaryCalendarMock = vi.hoisted(() => vi.fn());
const listCalendarsMock = vi.hoisted(() => vi.fn());
const therapistFindUniqueMock = vi.hoisted(() => vi.fn());
const therapistUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/google/google-oauth", () => ({
  buildGoogleOAuthConsentUrl: vi.fn(),
  createGoogleOAuthClient: vi.fn(),
  exchangeGoogleAuthorizationCode: exchangeCodeMock,
}));

vi.mock("@/lib/google/google-calendar", () => ({
  applyGoogleCalendarCredentials: vi.fn(),
  createGoogleCalendarClient: vi.fn(),
  getGoogleAuthenticatedUserProfile: getProfileMock,
  getGooglePrimaryCalendar: getPrimaryCalendarMock,
  listGoogleCalendars: listCalendarsMock,
  refreshGoogleAccessToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapistProfile: {
      findUnique: therapistFindUniqueMock,
      update: therapistUpdateMock,
    },
  },
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: vi.fn(),
  logDiagnosticEvent: vi.fn(),
}));

const completeScopes = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

const tokens = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiryDate: new Date("2026-08-13T12:00:00.000Z"),
  scope: completeScopes,
  tokenType: "Bearer",
  idToken: "id-token",
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", "https://staging.example/google/callback");
  exchangeCodeMock.mockResolvedValue({ client: {}, tokens });
  getProfileMock.mockResolvedValue({ email: "therapist@gmail.test", name: "Therapist" });
  getPrimaryCalendarMock.mockResolvedValue({ id: "primary-calendar" });
  therapistFindUniqueMock.mockResolvedValue({
    id: "profile-id",
    userId: "therapist-user-id",
    googleCalendarId: null,
    googleCalendarEmail: null,
    isGoogleCalendarConnected: false,
  });
  therapistUpdateMock.mockResolvedValue({
    id: "profile-id",
    userId: "therapist-user-id",
    googleCalendarId: "primary-calendar",
    googleCalendarEmail: "therapist@gmail.test",
    isGoogleCalendarConnected: true,
  });
});

describe("completeTherapistGoogleCalendarConnection", () => {
  it("rejects missing scopes before Google API reads or persistence", async () => {
    exchangeCodeMock.mockResolvedValue({
      client: {},
      tokens: { ...tokens, scope: "openid email profile" },
    });

    await expect(
      completeTherapistGoogleCalendarConnection("therapist-user-id", "authorization-code"),
    ).rejects.toMatchObject({ code: "GOOGLE_OAUTH_SCOPES_INSUFFICIENT" });

    expect(getProfileMock).not.toHaveBeenCalled();
    expect(getPrimaryCalendarMock).not.toHaveBeenCalled();
    expect(therapistUpdateMock).not.toHaveBeenCalled();
  });

  it.each([
    [getProfileMock, "GOOGLE_USERINFO_FETCH_FAILED"],
    [getPrimaryCalendarMock, "GOOGLE_CALENDAR_LIST_FETCH_FAILED"],
  ])("classifies Google API read failures and performs no write", async (failingMock, code) => {
    failingMock.mockRejectedValue(new Error("Request had insufficient authentication scopes."));

    await expect(
      completeTherapistGoogleCalendarConnection("therapist-user-id", "authorization-code"),
    ).rejects.toMatchObject({ code });

    expect(therapistUpdateMock).not.toHaveBeenCalled();
  });

  it("persists the connection only after scopes and both Google reads succeed", async () => {
    await expect(
      completeTherapistGoogleCalendarConnection("therapist-user-id", "authorization-code"),
    ).resolves.toMatchObject({ isGoogleCalendarConnected: true });

    expect(therapistUpdateMock).toHaveBeenCalledOnce();
    expect(therapistUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleCalendarEmail: "therapist@gmail.test",
          googleCalendarId: "primary-calendar",
          isGoogleCalendarConnected: true,
        }),
      }),
    );
  });
});

describe("getTherapistSelectedGoogleCalendarTimeZone", () => {
  const connectedProfile = {
    id: "profile-id",
    userId: "therapist-user-id",
    googleCalendarId: "selected-calendar",
    googleCalendarEmail: "therapist@gmail.test",
    googleAccessToken: "access-token",
    googleRefreshToken: "refresh-token",
    googleTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    googleCalendarConnectedAt: new Date("2026-08-01T00:00:00.000Z"),
    isGoogleCalendarConnected: true,
  };

  it("uses the selected calendar IANA timezone", async () => {
    therapistFindUniqueMock.mockResolvedValue(connectedProfile);
    listCalendarsMock.mockResolvedValue([
      {
        id: "selected-calendar",
        summary: "Work",
        primary: false,
        accessRole: "owner",
        timeZone: "Europe/Kyiv",
      },
    ]);

    await expect(
      getTherapistSelectedGoogleCalendarTimeZone("therapist-user-id"),
    ).resolves.toBe("Europe/Kyiv");
  });

  it.each([
    ["missing calendar timezone", null],
    ["invalid calendar timezone", "Europe/Fake"],
  ])("uses the canonical fallback for %s", async (_name, timeZone) => {
    therapistFindUniqueMock.mockResolvedValue(connectedProfile);
    listCalendarsMock.mockResolvedValue([
      {
        id: "selected-calendar",
        summary: "Work",
        primary: false,
        accessRole: "owner",
        timeZone,
      },
    ]);

    await expect(
      getTherapistSelectedGoogleCalendarTimeZone("therapist-user-id"),
    ).resolves.toBe("Europe/London");
  });

  it("uses the canonical fallback when Google calendar lookup fails", async () => {
    therapistFindUniqueMock.mockResolvedValue(connectedProfile);
    listCalendarsMock.mockRejectedValue(new Error("Google unavailable"));

    await expect(
      getTherapistSelectedGoogleCalendarTimeZone("therapist-user-id"),
    ).resolves.toBe("Europe/London");
  });

  it("uses the canonical fallback before lookup when no calendar is selected", async () => {
    therapistFindUniqueMock.mockResolvedValue({
      ...connectedProfile,
      googleCalendarId: null,
    });

    await expect(
      getTherapistSelectedGoogleCalendarTimeZone("therapist-user-id"),
    ).resolves.toBe("Europe/London");
    expect(listCalendarsMock).not.toHaveBeenCalled();
  });
});
