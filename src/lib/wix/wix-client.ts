import "server-only";

const WIX_API_BASE_URL = "https://www.wixapis.com";

export type WixConfig = {
  apiToken: string;
  siteId: string;
  therapistApplicationFormId: string;
  accountId: string | null;
};

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
  return {
    apiToken: readRequiredEnv("WIX_API_TOKEN", "Не налаштовано WIX_API_TOKEN."),
    siteId: readRequiredEnv("WIX_SITE_ID", "Не налаштовано WIX_SITE_ID."),
    therapistApplicationFormId: readRequiredEnv(
      "WIX_THERAPIST_APPLICATION_FORM_ID",
      "Не налаштовано WIX_THERAPIST_APPLICATION_FORM_ID.",
    ),
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
  const headers = new Headers(options.headers);

  headers.set("Authorization", config.apiToken);
  headers.set("Content-Type", "application/json");
  headers.set("wix-site-id", config.siteId);

  if (config.accountId) {
    headers.set("wix-account-id", config.accountId);
  }

  const response = await fetch(`${WIX_API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const responseBody = await parseWixResponseBody(response);

  if (!response.ok) {
    throw new WixApiRequestError(
      "Не вдалося виконати запит до Wix API.",
      response.status,
      responseBody,
    );
  }

  return responseBody as TResponse;
}
