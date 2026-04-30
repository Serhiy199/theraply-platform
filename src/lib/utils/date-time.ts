import { DEFAULT_THERAPIST_TIME_ZONE } from "@/lib/google/google-time-zone";

type FormatOptions = {
  locale?: string;
  timeZone?: string;
};

export function formatAppDateTime(
  date: Date | null,
  { locale = "en-GB", timeZone = DEFAULT_THERAPIST_TIME_ZONE }: FormatOptions = {},
) {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatAppDate(
  date: Date | null,
  { locale = "en-GB", timeZone = DEFAULT_THERAPIST_TIME_ZONE }: FormatOptions = {},
) {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "medium",
  }).format(date);
}
