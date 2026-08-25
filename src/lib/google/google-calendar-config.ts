import "server-only";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
] as const;

const GOOGLE_SCOPE_ALIASES: Readonly<Record<(typeof GOOGLE_CALENDAR_SCOPES)[number], readonly string[]>> = {
  openid: ["openid"],
  email: ["email", "https://www.googleapis.com/auth/userinfo.email"],
  profile: ["profile", "https://www.googleapis.com/auth/userinfo.profile"],
  "https://www.googleapis.com/auth/calendar": [
    "https://www.googleapis.com/auth/calendar",
  ],
};

export type GoogleOAuthScopeDiagnostics = {
  requestedScopes: string[];
  grantedScopes: string[];
  missingRequiredScopes: string[];
};

export function getGoogleOAuthScopeDiagnostics(
  grantedScope: string | null | undefined,
): GoogleOAuthScopeDiagnostics {
  const grantedScopes = [...new Set(grantedScope?.split(/\s+/).filter(Boolean) ?? [])].sort();
  const grantedScopeSet = new Set(grantedScopes);
  const missingRequiredScopes = GOOGLE_CALENDAR_SCOPES.filter(
    (requiredScope) =>
      !GOOGLE_SCOPE_ALIASES[requiredScope].some((alias) => grantedScopeSet.has(alias)),
  );

  return {
    requestedScopes: [...GOOGLE_CALENDAR_SCOPES],
    grantedScopes,
    missingRequiredScopes: [...missingRequiredScopes],
  };
}

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
