type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getDateTimePartsInTimeZone(date: Date, timeZone: string): TimeZoneDateParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partMap.get("year")),
    month: Number(partMap.get("month")),
    day: Number(partMap.get("day")),
    hour: Number(partMap.get("hour")),
    minute: Number(partMap.get("minute")),
    second: Number(partMap.get("second")),
  };
}

export function formatDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = getDateTimePartsInTimeZone(date, timeZone);

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = getDateTimePartsInTimeZone(date, timeZone);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return utcTimestamp - date.getTime();
}

export function createDateInTimeZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstOffset = getTimeZoneOffsetMilliseconds(utcGuess, timeZone);

  let zonedDate = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMilliseconds(zonedDate, timeZone);

  if (secondOffset !== firstOffset) {
    zonedDate = new Date(utcGuess.getTime() - secondOffset);
  }

  return zonedDate;
}
