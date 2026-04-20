import "server-only";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
] as const;

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: readonly string[];
};

export class GoogleCalendarConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleCalendarConfigError";
  }
}

function readOptionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

function readRequiredEnv(name: string) {
  const value = readOptionalEnv(name);

  if (!value) {
    throw new GoogleCalendarConfigError(`${name} is required for Google Calendar integration.`);
  }

  return value;
}

export function isGoogleCalendarConfigured() {
  return Boolean(
    readOptionalEnv("GOOGLE_CLIENT_ID") &&
      readOptionalEnv("GOOGLE_CLIENT_SECRET") &&
      readOptionalEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
  );
}

export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  return {
    clientId: readRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: readRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: readRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    scopes: GOOGLE_CALENDAR_SCOPES,
  };
}
