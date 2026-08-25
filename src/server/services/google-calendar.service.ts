import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  applyGoogleCalendarCredentials,
  createGoogleCalendarClient,
  getGoogleAuthenticatedUserProfile,
  listGoogleCalendars,
  getGooglePrimaryCalendar,
  refreshGoogleAccessToken,
} from "@/lib/google/google-calendar";
import { DEFAULT_APP_TIME_ZONE, resolveTimeZone } from "@/lib/time-zone";
import {
  buildGoogleOAuthConsentUrl,
  createGoogleOAuthClient,
  exchangeGoogleAuthorizationCode,
  type GoogleOAuthTokens,
} from "@/lib/google/google-oauth";
import {
  getGoogleOAuthScopeDiagnostics,
  isGoogleCalendarConfigured,
  type GoogleOAuthScopeDiagnostics,
} from "@/lib/google/google-calendar-config";
import {
  createAuditLogEntryBestEffort,
  logDiagnosticEvent,
} from "@/server/services/audit-log.service";

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

export type TherapistGoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  timeZone: string | null;
};

export type CreateTherapistGoogleCalendarEventInput = {
  therapistUserId: string;
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  clientEmail: string | null;
  clientDisplayName: string | null;
  therapistDisplayName: string | null;
  notes?: string | null;
};

export type CreatedTherapistGoogleCalendarEvent = {
  eventId: string;
  conferenceId: string | null;
  eventHtmlLink: string | null;
  meetingUrl: string | null;
};

export class GoogleCalendarServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "GOOGLE_CALENDAR_NOT_CONFIGURED"
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "GOOGLE_CALENDAR_NOT_CONNECTED"
      | "GOOGLE_REFRESH_TOKEN_MISSING"
      | "GOOGLE_CALENDAR_REAUTH_REQUIRED"
      | "GOOGLE_OAUTH_SCOPES_INSUFFICIENT"
      | "GOOGLE_USERINFO_FETCH_FAILED"
      | "GOOGLE_CALENDAR_LIST_FETCH_FAILED"
      | "GOOGLE_CALENDAR_SELECTION_INVALID"
      | "GOOGLE_CALENDAR_TARGET_MISSING"
      | "GOOGLE_CALENDAR_EVENT_CREATE_FAILED",
    public readonly diagnostics?: GoogleOAuthScopeDiagnostics,
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

function isGoogleCalendarUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("googleCalendarId")
  );
}

function isGoogleInvalidGrantError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const googleError = error as {
    code?: string | number;
    message?: string;
    response?: {
      data?: {
        error?: string;
        error_description?: string;
      };
    };
  };

  return (
    googleError.code === "invalid_grant" ||
    googleError.response?.data?.error === "invalid_grant" ||
    Boolean(googleError.message?.includes("invalid_grant")) ||
    Boolean(googleError.response?.data?.error_description?.includes("invalid_grant"))
  );
}

async function logGoogleCalendarAudit(
  actorUserId: string | null | undefined,
  entityId: string,
  action: string,
  before?: unknown,
  after?: unknown,
) {
  await createAuditLogEntryBestEffort({
    actorUserId,
    entityType: "GoogleCalendarIntegration",
    entityId,
    action,
    before,
    after,
  });
}

async function logGoogleCalendarFailure(
  actorUserId: string | null | undefined,
  entityId: string,
  action: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  logDiagnosticEvent("google-calendar", message, {
    actorUserId: actorUserId ?? null,
    entityId,
    action,
    ...(metadata ?? {}),
  });

  await logGoogleCalendarAudit(actorUserId, entityId, action, null, {
    status: "error",
    message,
    ...(metadata ?? {}),
  });
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

  await logGoogleCalendarAudit(therapistUserId, connection.id, "GOOGLE_CALENDAR_CONNECT_STARTED", {
    googleCalendarId: connection.googleCalendarId,
    googleCalendarEmail: connection.googleCalendarEmail,
    isGoogleCalendarConnected: connection.isGoogleCalendarConnected,
  }, {
    returnTo: normalizeOptionalString(returnTo),
  });

  return buildGoogleOAuthConsentUrl({
    therapistUserId: connection.userId,
    returnTo: normalizeOptionalString(returnTo),
  });
}

export async function exchangeGoogleCalendarCode(code: string) {
  ensureGoogleCalendarConfigured();
  return exchangeGoogleAuthorizationCode(code);
}

export async function completeTherapistGoogleCalendarConnection(
  therapistUserId: string,
  code: string,
) {
  ensureGoogleCalendarConfigured();

  const { client, tokens } = await exchangeGoogleCalendarCode(code);
  const scopeDiagnostics = getGoogleOAuthScopeDiagnostics(tokens.scope);

  if (scopeDiagnostics.missingRequiredScopes.length > 0) {
    throw new GoogleCalendarServiceError(
      "Google did not grant all required OAuth scopes.",
      "GOOGLE_OAUTH_SCOPES_INSUFFICIENT",
      scopeDiagnostics,
    );
  }

  const [profile, primaryCalendar] = await Promise.all([
    getGoogleAuthenticatedUserProfile(client).catch(() => {
      throw new GoogleCalendarServiceError(
        "Google user profile lookup failed.",
        "GOOGLE_USERINFO_FETCH_FAILED",
        scopeDiagnostics,
      );
    }),
    getGooglePrimaryCalendar(client).catch(() => {
      throw new GoogleCalendarServiceError(
        "Google Calendar list lookup failed.",
        "GOOGLE_CALENDAR_LIST_FETCH_FAILED",
        scopeDiagnostics,
      );
    }),
  ]);

  return saveTherapistGoogleCalendarConnection({
    therapistUserId,
    googleAccountEmail: profile.email,
    googleCalendarId: primaryCalendar?.id ?? null,
    tokens,
  });
}

export async function saveTherapistGoogleCalendarConnection(
  input: SaveGoogleCalendarConnectionInput,
) {
  const connection = await requireTherapistGoogleCalendarConnection(input.therapistUserId);

  let updatedConnection: TherapistGoogleCalendarConnection;

  try {
    updatedConnection = await prisma.therapistProfile.update({
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
  } catch (error) {
    if (isGoogleCalendarUniqueConstraintError(error)) {
      throw new GoogleCalendarServiceError(
        "This Google Calendar is already connected to another therapist profile.",
        "GOOGLE_CALENDAR_SELECTION_INVALID",
      );
    }

    throw error;
  }

  await logGoogleCalendarAudit(
    input.therapistUserId,
    connection.id,
    "GOOGLE_CALENDAR_CONNECTED",
    {
      googleCalendarId: connection.googleCalendarId,
      googleCalendarEmail: connection.googleCalendarEmail,
      isGoogleCalendarConnected: connection.isGoogleCalendarConnected,
    },
    {
      googleCalendarId: updatedConnection.googleCalendarId,
      googleCalendarEmail: updatedConnection.googleCalendarEmail,
      isGoogleCalendarConnected: updatedConnection.isGoogleCalendarConnected,
      googleCalendarConnectedAt: updatedConnection.googleCalendarConnectedAt,
    },
  );

  return updatedConnection;
}

export async function disconnectTherapistGoogleCalendarConnection(therapistUserId: string) {
  const connection = await requireTherapistGoogleCalendarConnection(therapistUserId);

  const updatedConnection = await prisma.therapistProfile.update({
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

  await logGoogleCalendarAudit(
    therapistUserId,
    connection.id,
    "GOOGLE_CALENDAR_DISCONNECTED",
    {
      googleCalendarId: connection.googleCalendarId,
      googleCalendarEmail: connection.googleCalendarEmail,
      isGoogleCalendarConnected: connection.isGoogleCalendarConnected,
    },
    {
      googleCalendarId: updatedConnection.googleCalendarId,
      googleCalendarEmail: updatedConnection.googleCalendarEmail,
      isGoogleCalendarConnected: updatedConnection.isGoogleCalendarConnected,
    },
  );

  return updatedConnection;
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

  try {
    const refreshedTokens = await refreshGoogleAccessToken(connection.googleRefreshToken);

    const updatedConnection = await prisma.therapistProfile.update({
      where: { userId: therapistUserId },
      data: {
        googleAccessToken: refreshedTokens.accessToken,
        googleRefreshToken: refreshedTokens.refreshToken ?? connection.googleRefreshToken,
        googleTokenExpiresAt: refreshedTokens.expiryDate,
        isGoogleCalendarConnected: true,
      },
      select: therapistGoogleCalendarConnectionSelect,
    });

    await logGoogleCalendarAudit(
      therapistUserId,
      connection.id,
      "GOOGLE_CALENDAR_TOKEN_REFRESHED",
      {
        googleTokenExpiresAt: connection.googleTokenExpiresAt,
      },
      {
        googleTokenExpiresAt: updatedConnection.googleTokenExpiresAt,
      },
    );

    return updatedConnection;
  } catch (error) {
    await logGoogleCalendarFailure(
      therapistUserId,
      connection.id,
      "GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED",
      "Google Calendar token refresh failed.",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );

    if (isGoogleInvalidGrantError(error)) {
      await prisma.therapistProfile.update({
        where: { userId: therapistUserId },
        data: {
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
          googleCalendarConnectedAt: null,
          isGoogleCalendarConnected: false,
        },
      });

      await logGoogleCalendarAudit(
        therapistUserId,
        connection.id,
        "GOOGLE_CALENDAR_REAUTH_REQUIRED",
        {
          googleCalendarId: connection.googleCalendarId,
          googleCalendarEmail: connection.googleCalendarEmail,
          isGoogleCalendarConnected: connection.isGoogleCalendarConnected,
        },
        {
          googleCalendarId: connection.googleCalendarId,
          googleCalendarEmail: connection.googleCalendarEmail,
          isGoogleCalendarConnected: false,
        },
      );

      throw new GoogleCalendarServiceError(
        "Google Calendar authorization expired or was revoked. The therapist needs to reconnect Google Calendar.",
        "GOOGLE_CALENDAR_REAUTH_REQUIRED",
      );
    }

    throw error;
  }
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

  const auth = createGoogleOAuthClient();
  applyGoogleCalendarCredentials(auth, {
    accessToken: connection.googleAccessToken,
    refreshToken: connection.googleRefreshToken,
    expiryDate: connection.googleTokenExpiresAt,
  });

  return {
    connection,
    auth,
    calendar: createGoogleCalendarClient({
      accessToken: connection.googleAccessToken,
      refreshToken: connection.googleRefreshToken,
      expiryDate: connection.googleTokenExpiresAt,
    }),
  };
}

export async function getTherapistSelectableGoogleCalendars(
  therapistUserId: string,
): Promise<TherapistGoogleCalendarOption[]> {
  const { auth } = await getAuthenticatedTherapistGoogleCalendarClient(therapistUserId);
  const calendars = await listGoogleCalendars(auth);

  return calendars
    .filter(
      (
        calendar,
      ): calendar is {
        id: string;
        summary: string | null;
        primary: boolean;
        accessRole: string | null;
        timeZone: string | null;
      } =>
        Boolean(calendar.id) &&
        ["owner", "writer"].includes(calendar.accessRole ?? ""),
    )
    .map((calendar) => ({
      id: calendar.id,
      summary: calendar.summary ?? calendar.id,
      primary: calendar.primary,
      timeZone: calendar.timeZone,
    }));
}

export async function getTherapistSelectedGoogleCalendarTimeZone(therapistUserId: string) {
  const connection = await requireTherapistGoogleCalendarConnection(therapistUserId);

  if (!connection.googleCalendarId) {
    return DEFAULT_APP_TIME_ZONE;
  }

  try {
    const calendars = await getTherapistSelectableGoogleCalendars(therapistUserId);
    const selectedCalendar = calendars.find((calendar) => calendar.id === connection.googleCalendarId);

    return resolveTimeZone(selectedCalendar?.timeZone);
  } catch {
    return DEFAULT_APP_TIME_ZONE;
  }
}

export async function updateTherapistSelectedGoogleCalendar(
  therapistUserId: string,
  googleCalendarId: string,
) {
  const normalizedCalendarId = normalizeOptionalString(googleCalendarId);

  if (!normalizedCalendarId) {
    throw new GoogleCalendarServiceError(
      "Please choose a Google Calendar before saving.",
      "GOOGLE_CALENDAR_SELECTION_INVALID",
    );
  }

  const calendars = await getTherapistSelectableGoogleCalendars(therapistUserId);
  const selectedCalendar = calendars.find((calendar) => calendar.id === normalizedCalendarId);

  if (!selectedCalendar) {
    throw new GoogleCalendarServiceError(
      "The selected Google Calendar is not available for this therapist account.",
      "GOOGLE_CALENDAR_SELECTION_INVALID",
    );
  }

  const connection = await requireTherapistGoogleCalendarConnection(therapistUserId);

  let updatedConnection: TherapistGoogleCalendarConnection;

  try {
    updatedConnection = await prisma.therapistProfile.update({
      where: { userId: therapistUserId },
      data: {
        googleCalendarId: selectedCalendar.id,
        isGoogleCalendarConnected: true,
      },
      select: therapistGoogleCalendarConnectionSelect,
    });
  } catch (error) {
    if (isGoogleCalendarUniqueConstraintError(error)) {
      throw new GoogleCalendarServiceError(
        "This Google Calendar is already connected to another therapist profile.",
        "GOOGLE_CALENDAR_SELECTION_INVALID",
      );
    }

    throw error;
  }

  await logGoogleCalendarAudit(
    therapistUserId,
    connection.id,
    "GOOGLE_CALENDAR_TARGET_UPDATED",
    {
      googleCalendarId: connection.googleCalendarId,
    },
    {
      googleCalendarId: updatedConnection.googleCalendarId,
      googleCalendarEmail: updatedConnection.googleCalendarEmail,
    },
  );

  return updatedConnection;
}

function buildCalendarEventSummary(clientDisplayName: string | null, therapistDisplayName: string | null) {
  if (clientDisplayName && therapistDisplayName) {
    return `Therapy session: ${clientDisplayName} with ${therapistDisplayName}`;
  }

  if (clientDisplayName) {
    return `Therapy session with ${clientDisplayName}`;
  }

  return "Therapy session";
}

function buildCalendarEventDescription(
  bookingId: string,
  therapistDisplayName: string | null,
  notes?: string | null,
) {
  const lines = [
    "Theraply booking confirmed.",
    `Booking ID: ${bookingId}`,
  ];

  if (therapistDisplayName) {
    lines.push(`Therapist: ${therapistDisplayName}`);
  }

  const normalizedNotes = normalizeOptionalString(notes);

  if (normalizedNotes) {
    lines.push("", "Client notes:", normalizedNotes);
  }

  return lines.join("\n");
}

export async function createTherapistGoogleCalendarEvent(
  input: CreateTherapistGoogleCalendarEventInput,
): Promise<CreatedTherapistGoogleCalendarEvent> {
  const { connection, calendar } = await getAuthenticatedTherapistGoogleCalendarClient(
    input.therapistUserId,
  );

  if (!connection.googleCalendarId) {
    throw new GoogleCalendarServiceError(
      "No target Google Calendar is selected for this therapist.",
      "GOOGLE_CALENDAR_TARGET_MISSING",
    );
  }

  const attendeeEmail = normalizeOptionalString(input.clientEmail);
  const attendeeName = normalizeOptionalString(input.clientDisplayName);
  const therapistDisplayName = normalizeOptionalString(input.therapistDisplayName);

  try {
    const response = await calendar.events.insert({
      calendarId: connection.googleCalendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: buildCalendarEventSummary(attendeeName, therapistDisplayName),
        description: buildCalendarEventDescription(
          input.bookingId,
          therapistDisplayName,
          input.notes,
        ),
        start: {
          dateTime: input.startsAt.toISOString(),
        },
        end: {
          dateTime: input.endsAt.toISOString(),
        },
        attendees: attendeeEmail
          ? [
              {
                email: attendeeEmail,
                displayName: attendeeName ?? undefined,
              },
            ]
          : undefined,
        conferenceData: {
          createRequest: {
            requestId: `theraply-booking-${input.bookingId}`,
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
      },
    });

    const eventId = normalizeOptionalString(response.data.id);

    if (!eventId) {
      throw new GoogleCalendarServiceError(
        "Google Calendar did not return an event id for the confirmed booking.",
        "GOOGLE_CALENDAR_EVENT_CREATE_FAILED",
      );
    }

    const entryPointUri =
      response.data.conferenceData?.entryPoints?.find((entryPoint) => entryPoint.uri)?.uri ?? null;

    const createdEvent = {
      eventId,
      conferenceId: normalizeOptionalString(response.data.conferenceData?.conferenceId),
      eventHtmlLink: normalizeOptionalString(response.data.htmlLink),
      meetingUrl: normalizeOptionalString(response.data.hangoutLink) ?? normalizeOptionalString(entryPointUri),
    };

    await logGoogleCalendarAudit(
      input.therapistUserId,
      input.bookingId,
      "GOOGLE_CALENDAR_EVENT_CREATED",
      {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        googleCalendarId: connection.googleCalendarId,
      },
      {
        eventId: createdEvent.eventId,
        conferenceId: createdEvent.conferenceId,
        eventHtmlLink: createdEvent.eventHtmlLink,
        meetingUrl: createdEvent.meetingUrl,
      },
    );

    return createdEvent;
  } catch (error) {
    await logGoogleCalendarFailure(
      input.therapistUserId,
      input.bookingId,
      "GOOGLE_CALENDAR_EVENT_CREATE_FAILED",
      "Google Calendar could not create an event for the booking.",
      {
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
    );

    if (error instanceof GoogleCalendarServiceError) {
      throw error;
    }

    throw new GoogleCalendarServiceError(
      "Google Calendar could not create a meeting for this booking.",
      "GOOGLE_CALENDAR_EVENT_CREATE_FAILED",
    );
  }
}

export async function deleteTherapistGoogleCalendarEvent(
  therapistUserId: string,
  eventId: string,
) {
  const normalizedEventId = normalizeOptionalString(eventId);

  if (!normalizedEventId) {
    return;
  }

  const { connection, calendar } = await getAuthenticatedTherapistGoogleCalendarClient(
    therapistUserId,
  );

  if (!connection.googleCalendarId) {
    return;
  }

  try {
    await calendar.events.delete({
      calendarId: connection.googleCalendarId,
      eventId: normalizedEventId,
    });

    await logGoogleCalendarAudit(
      therapistUserId,
      normalizedEventId,
      "GOOGLE_CALENDAR_EVENT_DELETED",
      {
        googleCalendarId: connection.googleCalendarId,
      },
      {
        deleted: true,
      },
    );
  } catch (error) {
    await logGoogleCalendarFailure(
      therapistUserId,
      normalizedEventId,
      "GOOGLE_CALENDAR_EVENT_DELETE_FAILED",
      "Google Calendar could not delete the event.",
      {
        googleCalendarId: connection.googleCalendarId,
        error: error instanceof Error ? error.message : String(error),
      },
    );

    throw error;
  }
}
