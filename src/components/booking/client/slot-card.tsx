import type { TherapistAvailabilitySlot } from "@/server/services/booking-flow.service";
import { RequestSlotForm } from "@/components/booking/client/request-slot-form";
import { Badge } from "@/components/ui/badge";

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
  const startTime = formatTime(slot.startsAt, slot.timeZone);
  const endTime = formatTime(slot.endsAt, slot.timeZone);

  return (
    <article
      aria-disabled={slot.isAvailable ? undefined : true}
      aria-label={`${startTime} - ${endTime}, ${slot.isAvailable ? "available" : "booked"}`}
      className={`rounded-[1.5rem] border p-4 shadow-sm shadow-slate-950/5 ${slot.isAvailable ? "border-emerald-200/80 bg-emerald-50/70" : "border-slate-200/80 bg-slate-100/80"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Session slot</p>
          <h4 className="mt-2 text-xl font-semibold text-slate-900">
            {startTime} - {endTime}
          </h4>
        </div>
        <Badge className={slot.isAvailable ? "border-emerald-200 bg-white/80 text-emerald-800" : "border-slate-200 bg-white/70 text-slate-600"}>
          {slot.isAvailable ? "Available" : "Booked"}
        </Badge>
      </div>

      {slot.isAvailable ? (
        <RequestSlotForm
          therapistId={slot.therapistId}
          startsAt={slot.startsAt.toISOString()}
          endsAt={slot.endsAt.toISOString()}
        />
      ) : (
        <div className="mt-4 text-sm text-slate-600">
          This time is already booked.
        </div>
      )}
    </article>
  );
}
