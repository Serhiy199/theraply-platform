import { BOOKING_FLOW_MIN_HOURS_BEFORE_SESSION } from "@/lib/constants/booking-flow";

type RawAvailabilitySlot = {
  startsAt: Date;
  isAvailable: boolean;
};

export type BookingAvailabilitySlot<T extends RawAvailabilitySlot> = T & {
  unavailableReason?: "conflict" | "lead_time";
};

const MINIMUM_BOOKING_LEAD_TIME_MS =
  BOOKING_FLOW_MIN_HOURS_BEFORE_SESSION * 60 * 60 * 1000;

export function meetsBookingLeadTime(startsAt: Date, now = new Date()) {
  return startsAt.getTime() - now.getTime() >= MINIMUM_BOOKING_LEAD_TIME_MS;
}

export function applyBookingAvailabilityPolicy<T extends RawAvailabilitySlot>(
  slot: T,
  now = new Date(),
): BookingAvailabilitySlot<T> {
  if (!meetsBookingLeadTime(slot.startsAt, now)) {
    return {
      ...slot,
      isAvailable: false,
      unavailableReason: "lead_time",
    };
  }

  if (!slot.isAvailable) {
    return {
      ...slot,
      unavailableReason: "conflict",
    };
  }

  return slot;
}
