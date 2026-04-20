export type AvailabilityTimeRange = {
  startsAt: Date;
  endsAt: Date;
};

export type DiscreteAvailabilitySlot = AvailabilityTimeRange & {
  isAvailable: boolean;
};

export type AvailabilitySlotMapperOptions = {
  from: Date;
  to: Date;
  slotDurationMinutes: number;
  businessHoursStart: number;
  businessHoursEnd: number;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function clampRange(
  range: AvailabilityTimeRange,
  from: Date,
  to: Date,
): AvailabilityTimeRange | null {
  const startsAt = range.startsAt < from ? from : range.startsAt;
  const endsAt = range.endsAt > to ? to : range.endsAt;

  if (endsAt <= startsAt) {
    return null;
  }

  return { startsAt, endsAt };
}

export function mergeAvailabilityBusyRanges(
  ranges: AvailabilityTimeRange[],
  from: Date,
  to: Date,
) {
  const normalized = ranges
    .map((range) => clampRange(range, from, to))
    .filter((range): range is AvailabilityTimeRange => Boolean(range))
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

  const merged: AvailabilityTimeRange[] = [];

  for (const range of normalized) {
    const previous = merged[merged.length - 1];

    if (!previous) {
      merged.push({ ...range });
      continue;
    }

    if (range.startsAt <= previous.endsAt) {
      if (range.endsAt > previous.endsAt) {
        previous.endsAt = range.endsAt;
      }

      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

export function buildDiscreteAvailabilitySlots(
  busyRanges: AvailabilityTimeRange[],
  options: AvailabilitySlotMapperOptions,
): DiscreteAvailabilitySlot[] {
  const mergedBusyRanges = mergeAvailabilityBusyRanges(busyRanges, options.from, options.to);
  const slots: DiscreteAvailabilitySlot[] = [];
  let cursor = new Date(options.from);

  while (cursor < options.to) {
    const startsAt = new Date(cursor);
    const endsAt = addMinutes(startsAt, options.slotDurationMinutes);

    const withinBusinessHours =
      startsAt.getHours() >= options.businessHoursStart &&
      endsAt.getHours() <= options.businessHoursEnd &&
      endsAt <= options.to;

    if (withinBusinessHours) {
      const isAvailable = !mergedBusyRanges.some((range) =>
        overlaps(startsAt, endsAt, range.startsAt, range.endsAt),
      );

      slots.push({
        startsAt,
        endsAt,
        isAvailable,
      });
    }

    cursor = addMinutes(cursor, options.slotDurationMinutes);
  }

  return slots;
}
