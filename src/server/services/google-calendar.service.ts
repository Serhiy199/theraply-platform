import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createGoogleCalendarClient, refreshGoogleAccessToken } from "@/lib/google/google-calendar";
import {
  buildGoogleOAuthConsentUrl,
  exchangeGoogleAuthorizationCode,
  type GoogleOAuthTokens,
} from "@/lib/google/google-oauth";
import { isGoogleCalendarConfigured } from "@/lib/google/google-calendar-config";

const therapistGoogleCalendarConnectionSelect = {
  id: true,
  userId: true,
  displayName: true,
  googleCalendarId: true,
  googleCalendarEmail: true,
  googleAccessToken: true,
  googleRefreshToken: true,
  googleTokenExpiresAt: true,
  googleCalendarConnectedAt: true,
  isGoogleCalendarConnected: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.TherapistProfileSelect;

export type TherapistGoogleCalendarConnection = Prisma.TherapistProfileGetPayload<{
  select: typeof therapistGoogleCalendarConnectionSelect;
}>;

export type SaveGoogleCalendarConnectionInput = {
  therapistUserId: string;
  googleAccountEmail: string | null;
  googleCalendarId?: string | null;
  tokens: GoogleOAuthTokens;
};

export class GoogleCalendarServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "GOOGLE_CALENDAR_NOT_CONFIGURED"
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "GOOGLE_CALENDAR_NOT_CONNECTED"
      | "GOOGLE_REFRESH_TOKEN_MISSING",
  ) {
    super(message);
    this.name = "GoogleCalendarServiceError";
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function ensureGoogleCalendarConfigured() {
  if (!isGoogleCalendarConfigured()) {
    throw new GoogleCalendarServiceError(
      "Google Calendar integration is not configured in the environment.",
      "GOOGLE_CALENDAR_NOT_CONFIGURED",
    );
  }
}

export async function getTherapistGoogleCalendarConnection(
  therapistUserId: string,
): Promise<TherapistGoogleCalendarConnection | null> {
  return prisma.therapistProfile.findUnique({
    where: { userId: therapistUserId },
    select: therapistGoogleCalendarConnectionSelect,
  });
}

export async function requireTherapistGoogleCalendarConnection(therapistUserId: string) {
  const connection = await getTherapistGoogleCalendarConnection(therapistUserId);

  if (!connection) {
    throw new GoogleCalendarServiceError(
      "Therapist profile not found for Google Calendar integration.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  return connection;
}

export async function buildTherapistGoogleCalendarConnectUrl(
  therapistUserId: string,
  returnTo?: string | null,
) {
  ensureGoogleCalendarConfigured();

  const connection = await requireTherapistGoogleCalendarConnection(therapistUserId);

  return buildGoogleOAuthConsentUrl({
    therapistUserId: connection.userId,
    returnTo: normalizeOptionalString(returnTo),
  });
}

export async function exchangeGoogleCalendarCode(code: string) {
  ensureGoogleCalendarConfigured();
  return exchangeGoogleAuthorizationCode(code);
}

export async function saveTherapistGoogleCalendarConnection(
  input: SaveGoogleCalendarConnectionInput,
) {
  await requireTherapistGoogleCalendarConnection(input.therapistUserId);

  return prisma.therapistProfile.update({
    where: { userId: input.therapistUserId },
    data: {
      googleCalendarEmail: normalizeOptionalString(input.googleAccountEmail),
      googleCalendarId: normalizeOptionalString(input.googleCalendarId),
      googleAccessToken: input.tokens.accessToken,
      googleRefreshToken: input.tokens.refreshToken,
      googleTokenExpiresAt: input.tokens.expiryDate,
      googleCalendarConnectedAt: new Date(),
      isGoogleCalendarConnected: true,
    },
    select: therapistGoogleCalendarConnectionSelect,
  });
}

export async function disconnectTherapistGoogleCalendarConnection(therapistUserId: string) {
  await requireTherapistGoogleCalendarConnection(therapistUserId);

  return prisma.therapistProfile.update({
    where: { userId: therapistUserId },
    data: {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
      googleCalendarConnectedAt: null,
      isGoogleCalendarConnected: false,
    },
    select: therapistGoogleCalendarConnectionSelect,
  });
}

export async function refreshTherapistGoogleCalendarAccessToken(therapistUserId: string) {
  ensureGoogleCalendarConfigured();

  const connection = await requireTherapistGoogleCalendarConnection(therapistUserId);

  if (!connection.googleRefreshToken) {
    throw new GoogleCalendarServiceError(
      "Google Calendar refresh token is missing for this therapist.",
      "GOOGLE_REFRESH_TOKEN_MISSING",
    );
  }

  const refreshedTokens = await refreshGoogleAccessToken(connection.googleRefreshToken);

  return prisma.therapistProfile.update({
    where: { userId: therapistUserId },
    data: {
      googleAccessToken: refreshedTokens.accessToken,
      googleRefreshToken: refreshedTokens.refreshToken ?? connection.googleRefreshToken,
      googleTokenExpiresAt: refreshedTokens.expiryDate,
      isGoogleCalendarConnected: true,
    },
    select: therapistGoogleCalendarConnectionSelect,
  });
}

export async function getAuthenticatedTherapistGoogleCalendarClient(therapistUserId: string) {
  ensureGoogleCalendarConfigured();

  let connection = await requireTherapistGoogleCalendarConnection(therapistUserId);

  if (!connection.isGoogleCalendarConnected) {
    throw new GoogleCalendarServiceError(
      "Google Calendar is not connected for this therapist.",
      "GOOGLE_CALENDAR_NOT_CONNECTED",
    );
  }

  if (!connection.googleRefreshToken) {
    throw new GoogleCalendarServiceError(
      "Google Calendar refresh token is missing for this therapist.",
      "GOOGLE_REFRESH_TOKEN_MISSING",
    );
  }

  const shouldRefreshAccessToken =
    !connection.googleAccessToken ||
    !connection.googleTokenExpiresAt ||
    connection.googleTokenExpiresAt.getTime() <= Date.now() + 60_000;

  if (shouldRefreshAccessToken) {
    connection = await refreshTherapistGoogleCalendarAccessToken(therapistUserId);
  }

  return {
    connection,
    calendar: createGoogleCalendarClient({
      accessToken: connection.googleAccessToken,
      refreshToken: connection.googleRefreshToken,
      expiryDate: connection.googleTokenExpiresAt,
    }),
  };
}
