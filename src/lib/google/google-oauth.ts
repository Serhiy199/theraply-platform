import "server-only";
import { google } from "googleapis";
import { GOOGLE_CALENDAR_SCOPES, getGoogleCalendarConfig } from "@/lib/google/google-calendar-config";

export type GoogleOAuthStatePayload = {
  therapistUserId: string;
  returnTo?: string | null;
};

export type GoogleOAuthTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: Date | null;
  scope: string | null;
  tokenType: string | null;
  idToken: string | null;
};

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toDateOrNull(value: number | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value);
}

export function createGoogleOAuthClient() {
  const config = getGoogleCalendarConfig();

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
}

export function serializeGoogleOAuthState(payload: GoogleOAuthStatePayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function parseGoogleOAuthState(state: string): GoogleOAuthStatePayload {
  const decoded = Buffer.from(state, "base64url").toString("utf8");
  const payload = JSON.parse(decoded) as GoogleOAuthStatePayload;

  if (!payload.therapistUserId?.trim()) {
    throw new Error("Invalid Google OAuth state payload.");
  }

  return payload;
}

export function buildGoogleOAuthConsentUrl(payload: GoogleOAuthStatePayload) {
  const client = createGoogleOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state: serializeGoogleOAuthState(payload),
    include_granted_scopes: true,
  });
}

export function normalizeGoogleOAuthTokens(
  credentials: Parameters<ReturnType<typeof createGoogleOAuthClient>["setCredentials"]>[0],
): GoogleOAuthTokens {
  return {
    accessToken: normalizeOptionalString(credentials.access_token),
    refreshToken: normalizeOptionalString(credentials.refresh_token),
    expiryDate: toDateOrNull(credentials.expiry_date),
    scope: normalizeOptionalString(credentials.scope),
    tokenType: normalizeOptionalString(credentials.token_type),
    idToken: normalizeOptionalString(credentials.id_token),
  };
}

export async function exchangeGoogleAuthorizationCode(code: string) {
  const client = createGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  return {
    client,
    tokens: normalizeGoogleOAuthTokens(tokens),
  };
}
