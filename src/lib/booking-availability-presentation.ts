import type { TherapistAvailabilitySlot } from "@/server/services/booking-flow.service";

export function getVisibleAvailabilitySlots(slots: TherapistAvailabilitySlot[]) {
  return slots.filter(
    (slot) => slot.isAvailable || slot.unavailableReason !== "lead_time",
  );
}

export function getAvailabilityCountLabel(slots: TherapistAvailabilitySlot[]) {
  const availableCount = slots.filter((slot) => slot.isAvailable).length;

  return availableCount === 0
    ? "Fully booked"
    : `${availableCount} available`;
}
