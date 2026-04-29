import { BOOKING_FLOW_MESSAGES } from "@/lib/constants/booking-flow";
import type { TherapistAvailabilitySlot } from "@/server/services/booking-flow.service";
import { RequestSlotForm } from "@/components/booking/client/request-slot-form";
import { BookingStatusAlert } from "@/components/booking/client/booking-status-alert";

function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

type SlotCardProps = {
  slot: TherapistAvailabilitySlot;
};

export function SlotCard({ slot }: SlotCardProps) {
  const isLeadTimeBlocked = slot.unavailableReason === "lead_time";

  return (
    <article className={`rounded-[1.5rem] border p-4 shadow-sm shadow-slate-950/5 ${slot.isAvailable ? "border-emerald-200/80 bg-emerald-50/70" : "border-slate-200/80 bg-slate-100/80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Session slot</p>
          <h4 className="mt-2 text-xl font-semibold text-slate-900">
            {formatTime(slot.startsAt, slot.timeZone)} - {formatTime(slot.endsAt, slot.timeZone)}
          </h4>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${slot.isAvailable ? "border-emerald-200 bg-white/80 text-emerald-800" : "border-slate-200 bg-white/70 text-slate-600"}`}>
          {slot.isAvailable ? BOOKING_FLOW_MESSAGES.availableLabel : BOOKING_FLOW_MESSAGES.unavailableLabel}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        {slot.isAvailable
          ? "This slot is ready for the booking request step. Once submitted, it will wait for therapist confirmation."
          : isLeadTimeBlocked
            ? "This slot is too close to the start time. To keep the payment window valid, it cannot be booked anymore."
            : "This time is blocked by another active booking request or confirmed session and cannot be selected."}
      </p>

      {slot.isAvailable ? (
        <RequestSlotForm
          therapistId={slot.therapistId}
          startsAt={slot.startsAt.toISOString()}
          endsAt={slot.endsAt.toISOString()}
        />
      ) : (
        <div className="mt-4">
          <BookingStatusAlert tone="warning" title={isLeadTimeBlocked ? "Too late to book" : "Slot conflict"}>
            {isLeadTimeBlocked
              ? BOOKING_FLOW_MESSAGES.slotTooSoon
              : BOOKING_FLOW_MESSAGES.slotConflict}
          </BookingStatusAlert>
        </div>
      )}
    </article>
  );
}
