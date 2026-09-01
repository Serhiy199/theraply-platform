import "server-only";

const WIX_API_BASE_URL = "https://www.wixapis.com";

export type WixConfig = {
  apiToken: string;
  siteId: string;
  therapistApplicationFormId: string;
  accountId: string | null;
};

export type WixAuthConfig = Pick<WixConfig, "apiToken" | "accountId">;

export class WixConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WixConfigError";
  }
}

export class WixApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = "WixApiRequestError";
  }
}

export type WixApiRequestDiagnostic = {
  operation: string;
  httpStatus: number;
  wixErrorCode: string | null;
  wixErrorMessage: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeWixErrorMessage(value: string) {
  return value
    .replace(/\bIST\.[A-Za-z0-9._-]{20,}\b/g, "[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, "[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 300);
}

export function getWixApiRequestDiagnostic(
  error: unknown,
  operation: string,
): WixApiRequestDiagnostic | null {
  if (!(error instanceof WixApiRequestError)) {
    return null;
  }

  const response = isRecord(error.details) ? error.details : {};
  const details = isRecord(response.details) ? response.details : {};
  const applicationError = isRecord(details.applicationError)
    ? details.applicationError
    : {};
  const wixErrorCode =
    readString(applicationError.code) ??
    readString(response.errorCode) ??
    readString(response.code);
  const wixErrorMessage =
    readString(applicationError.description) ??
    readString(response.message) ??
    error.message;

  return {
    operation,
    httpStatus: error.status,
    wixErrorCode,
    wixErrorMessage: sanitizeWixErrorMessage(wixErrorMessage),
  };
}

function readOptionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

function readRequiredEnv(name: string, missingMessage: string) {
  const value = readOptionalEnv(name);

  if (!value) {
    throw new WixConfigError(missingMessage);
  }

  return value;
}

export function getWixConfig(): WixConfig {
  const authConfig = getWixAuthConfig();

  return {
    ...authConfig,
    siteId: readRequiredEnv("WIX_SITE_ID", "WIX_SITE_ID is not configured."),
    therapistApplicationFormId: readRequiredEnv(
      "WIX_THERAPIST_APPLICATION_FORM_ID",
      "WIX_THERAPIST_APPLICATION_FORM_ID is not configured.",
    ),
  };
}

export function getWixAuthConfig(): WixAuthConfig {
  return {
    apiToken: readRequiredEnv("WIX_API_TOKEN", "WIX_API_TOKEN is not configured."),
    accountId: readOptionalEnv("WIX_ACCOUNT_ID"),
  };
}

export function isWixConfigured() {
  return Boolean(
    readOptionalEnv("WIX_API_TOKEN") &&
      readOptionalEnv("WIX_SITE_ID") &&
      readOptionalEnv("WIX_THERAPIST_APPLICATION_FORM_ID"),
  );
}

type WixRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: HeadersInit;
};

async function parseWixResponseBody(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

export async function wixRequest<TResponse>(
  path: string,
  options: WixRequestOptions = {},
): Promise<TResponse> {
  const config = getWixConfig();
  return wixRequestForSite<TResponse>(config.siteId, path, options);
}

export async function wixRequestForSite<TResponse>(
  siteId: string,
  path: string,
  options: WixRequestOptions = {},
): Promise<TResponse> {
  const config = getWixAuthConfig();
  return wixRequestForSiteWithApiToken(
    siteId,
    config.apiToken,
    path,
    options,
    config.accountId,
  );
}

export async function wixRequestForSiteWithApiToken<TResponse>(
  siteId: string,
  apiToken: string,
  path: string,
  options: WixRequestOptions = {},
  accountId: string | null = readOptionalEnv("WIX_ACCOUNT_ID"),
): Promise<TResponse> {
  const headers = new Headers(options.headers);

  headers.set("Authorization", apiToken);
  headers.set("Content-Type", "application/json");
  headers.set("wix-site-id", siteId);

  if (accountId) {
    headers.set("wix-account-id", accountId);
  }

  const response = await fetch(`${WIX_API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const responseBody = await parseWixResponseBody(response);

  if (!response.ok) {
    throw new WixApiRequestError(
      "The Wix API request failed.",
      response.status,
      responseBody,
    );
  }

  return responseBody as TResponse;
}
