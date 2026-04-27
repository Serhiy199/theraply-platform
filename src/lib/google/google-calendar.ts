import "server-only";
import { google } from "googleapis";
import { createGoogleOAuthClient, normalizeGoogleOAuthTokens, type GoogleOAuthTokens } from "@/lib/google/google-oauth";

export type GoogleCalendarCredentialsInput = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: Date | string | null;
};

function toExpiryTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

export function applyGoogleCalendarCredentials(
  client: ReturnType<typeof createGoogleOAuthClient>,
  credentials: GoogleCalendarCredentialsInput,
) {
  client.setCredentials({
    access_token: credentials.accessToken ?? undefined,
    refresh_token: credentials.refreshToken ?? undefined,
    expiry_date: toExpiryTimestamp(credentials.expiryDate),
  });

  return client;
}

export function createGoogleCalendarClient(credentials?: GoogleCalendarCredentialsInput) {
  const auth = createGoogleOAuthClient();

  if (credentials) {
    applyGoogleCalendarCredentials(auth, credentials);
  }

  return google.calendar({
    version: "v3",
    auth,
  });
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleOAuthTokens> {
  const auth = createGoogleOAuthClient();
  auth.setCredentials({
    refresh_token: refreshToken,
  });

  await auth.getAccessToken();

  return normalizeGoogleOAuthTokens(auth.credentials);
}

export type GoogleAuthenticatedUserProfile = {
  email: string | null;
  name: string | null;
};

export type GoogleCalendarListItem = {
  id: string | null;
  summary: string | null;
  primary: boolean;
  accessRole: string | null;
  timeZone: string | null;
};

export async function getGoogleAuthenticatedUserProfile(
  auth: ReturnType<typeof createGoogleOAuthClient>,
): Promise<GoogleAuthenticatedUserProfile> {
  const oauth2 = google.oauth2({
    version: "v2",
    auth,
  });

  const response = await oauth2.userinfo.get();

  return {
    email: response.data.email?.trim() || null,
    name: response.data.name?.trim() || null,
  };
}

export async function listGoogleCalendars(
  auth: ReturnType<typeof createGoogleOAuthClient>,
): Promise<GoogleCalendarListItem[]> {
  const calendar = google.calendar({
    version: "v3",
    auth,
  });

  const response = await calendar.calendarList.list();

  return (response.data.items ?? []).map((item) => ({
    id: item.id?.trim() || null,
    summary: item.summary?.trim() || null,
    primary: Boolean(item.primary),
    accessRole: item.accessRole?.trim() || null,
    timeZone: item.timeZone?.trim() || null,
  }));
}

export async function getGooglePrimaryCalendar(
  auth: ReturnType<typeof createGoogleOAuthClient>,
): Promise<GoogleCalendarListItem | null> {
  const calendars = await listGoogleCalendars(auth);
  return calendars.find((calendar) => calendar.primary) ?? calendars[0] ?? null;
}
