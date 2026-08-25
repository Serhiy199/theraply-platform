import { resolveTimeZone } from "@/lib/time-zone";

type FormatOptions = {
  locale?: string;
  timeZone?: string;
};

export function formatAppDateTime(
  date: Date | null,
  { locale = "en-GB", timeZone }: FormatOptions = {},
) {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveTimeZone(timeZone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatAppDate(
  date: Date | null,
  { locale = "en-GB", timeZone }: FormatOptions = {},
) {
  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: resolveTimeZone(timeZone),
    dateStyle: "medium",
  }).format(date);
}
