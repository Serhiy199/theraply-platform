const LOCAL_APP_URL = "http://localhost:3000";

export class CanonicalAppUrlConfigError extends Error {
  constructor(message = "Canonical application URL is not configured.") {
    super(message);
    this.name = "CanonicalAppUrlConfigError";
  }
}

function parseCanonicalBaseUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new CanonicalAppUrlConfigError("Canonical application URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CanonicalAppUrlConfigError("Canonical application URL must use HTTP or HTTPS.");
  }

  return url;
}

export function getCanonicalAppBaseUrl() {
  const configuredUrl =
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredUrl) {
    return parseCanonicalBaseUrl(configuredUrl);
  }

  if (process.env.NODE_ENV === "production") {
    throw new CanonicalAppUrlConfigError();
  }

  return new URL(LOCAL_APP_URL);
}

export function buildCanonicalAppUrl(pathname: string) {
  return new URL(pathname, getCanonicalAppBaseUrl());
}
