export const DEFAULT_APP_TIME_ZONE = "Europe/London";

export function isValidIanaTimeZone(value: string) {
  const candidate = value.trim();

  if (!candidate) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(
  candidate?: string | null,
  fallback = DEFAULT_APP_TIME_ZONE,
) {
  const normalizedCandidate = candidate?.trim();

  if (normalizedCandidate && isValidIanaTimeZone(normalizedCandidate)) {
    return normalizedCandidate;
  }

  const normalizedFallback = fallback.trim();
  return isValidIanaTimeZone(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_APP_TIME_ZONE;
}

export function getTimeZoneDisplayLabel(timeZone?: string | null) {
  return resolveTimeZone(timeZone);
}
