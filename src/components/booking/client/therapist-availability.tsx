import { formatDateKeyInTimeZone } from "@/lib/google/google-time-zone";
import Link from "next/link";
import type { TherapistListItem } from "@/lib/contracts/booking-flow";
import { BOOKING_FLOW_MESSAGES, BOOKING_FLOW_WINDOW_DAYS } from "@/lib/constants/booking-flow";
import type { TherapistAvailabilitySlot } from "@/server/services/booking-flow.service";
import { SlotCard } from "@/components/booking/client/slot-card";
import { BookingEmptyState } from "@/components/booking/client/booking-empty-state";
import { BookingStatusAlert } from "@/components/booking/client/booking-status-alert";

function getDisplayName(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.displayName ||
    [therapist.firstName, therapist.lastName].filter(Boolean).join(" ") ||
    therapist.email
  );
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Price not set yet";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value / 100);
}

function formatDayLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
}

function groupSlotsByDay(slots: TherapistAvailabilitySlot[]) {
  const groups = new Map<string, TherapistAvailabilitySlot[]>();

  for (const slot of slots) {
    const key = formatDateKeyInTimeZone(slot.startsAt, slot.timeZone);
    const existing = groups.get(key);

    if (existing) {
      existing.push(slot);
    } else {
      groups.set(key, [slot]);
    }
  }

  return Array.from(groups.entries()).map(([key, daySlots]) => ({
    key,
    label: formatDayLabel(daySlots[0].startsAt, daySlots[0].timeZone),
    slots: daySlots,
  }));
}

type TherapistAvailabilityProps = {
  therapist: TherapistListItem;
  slots: TherapistAvailabilitySlot[];
  availabilityIssue?: string | null;
};

export function TherapistAvailability({
  therapist,
  slots,
  availabilityIssue,
}: TherapistAvailabilityProps) {
  const slotGroups = groupSlotsByDay(slots);
  const availableCount = slots.filter((slot) => slot.isAvailable).length;
  const unavailableCount = slots.length - availableCount;
  const leadTimeBlockedCount = slots.filter(
    (slot) => !slot.isAvailable && slot.unavailableReason === "lead_time",
  ).length;
  const conflictBlockedCount = slots.filter(
    (slot) => !slot.isAvailable && slot.unavailableReason === "conflict",
  ).length;
  const displayTimeZone = slots[0]?.timeZone ?? "Europe/London";
  const hasCalendarConnection = Boolean(
    therapist.therapistProfile?.isGoogleCalendarConnected &&
      therapist.therapistProfile?.googleCalendarId,
  );

  return (
    <div className="grid gap-6">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Client booking flow</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Available slots for {getDisplayName(therapist)}</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Pick a time that works for you. The booking request will be sent to the therapist and remain pending until they confirm it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{availableCount}</span> available slot{availableCount === 1 ? "" : "s"}
            </div>
            <Link
              href="/client/book/new"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Change therapist
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Therapist profile</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">{getDisplayName(therapist)}</h3>
            <dl className="mt-5 grid gap-4 text-sm text-slate-600">
              <div>
                <dt className="font-medium text-slate-700">Specialization</dt>
                <dd className="mt-1">{therapist.therapistProfile?.specialization ?? "To be defined"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Session price</dt>
                <dd className="mt-1">{formatCurrency(therapist.therapistProfile?.sessionPricePence)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Profile summary</dt>
                <dd className="mt-1 leading-6">{therapist.therapistProfile?.bio ?? "Profile details will expand as therapist onboarding continues."}</dd>
              </div>
            </dl>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Booking window</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">Next {BOOKING_FLOW_WINDOW_DAYS} days</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {BOOKING_FLOW_MESSAGES.pendingLabel}. Slot request submission is the next step, so this screen focuses on availability and timing selection.
            </p>
            <div className="mt-3 rounded-[1.25rem] border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              Sessions must be requested at least 25 hours before the start time so the therapist can confirm them and the payment window still remains valid.
            </div>
            <div className="mt-5 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              Calendar sync: {therapist.therapistProfile?.googleCalendarEmail ?? "Not connected yet"}
            </div>
            <div className="mt-3 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              Times shown in: <span className="font-semibold text-slate-900">{displayTimeZone}</span>
            </div>
            {!hasCalendarConnection ? (
              <div className="mt-4">
                <BookingStatusAlert tone="warning" title="Calendar setup is not complete">
                  This therapist has not finished Google Calendar setup yet, so real availability cannot be shown.
                </BookingStatusAlert>
              </div>
            ) : null}
            {availabilityIssue ? (
              <div className="mt-4">
                <BookingStatusAlert tone="warning" title="Availability could not be loaded">
                  {availabilityIssue}
                </BookingStatusAlert>
              </div>
            ) : null}
          </article>
        </div>
      </section>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Therapist availability</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Choose a time</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Available slots are generated from the current booking window and existing booking conflicts. On the next step, one of these slots will become a real booking request.
            </p>
          </div>
        </div>

        {slotGroups.length ? (
          <>
            <div className="mt-6">
              {availableCount > 0 ? (
                <BookingStatusAlert title="Slots ready for booking">
                  Choose any available slot below to send a booking request. Unavailable cards are shown too, so conflicts stay visible instead of silently disappearing.
                </BookingStatusAlert>
              ) : (
                <BookingStatusAlert tone="warning" title="All visible slots are currently blocked">
                  {BOOKING_FLOW_MESSAGES.slotConflict} Try another therapist or come back later when the schedule changes.
                </BookingStatusAlert>
              )}
            </div>

            <div className="mt-6 grid gap-5">
              {slotGroups.map((group) => (
                <section key={group.key} className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Availability day</p>
                      <h3 className="mt-2 text-2xl font-semibold text-slate-900">{group.label}</h3>
                    </div>
                    <p className="text-sm text-slate-600">
                      {group.slots.filter((slot) => slot.isAvailable).length} available of {group.slots.length}
                    </p>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.slots.map((slot) => (
                      <SlotCard key={`${slot.startsAt.toISOString()}-${slot.endsAt.toISOString()}`} slot={slot} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {unavailableCount > 0 ? (
              <div className="mt-6">
                <BookingStatusAlert
                  tone="info"
                  title={
                    conflictBlockedCount > 0 && leadTimeBlockedCount > 0
                      ? "Availability guardrails are enabled"
                      : leadTimeBlockedCount > 0
                        ? "Short-notice protection is enabled"
                        : "Conflict visibility is enabled"
                  }
                >
                  {conflictBlockedCount > 0
                    ? `${conflictBlockedCount} slot${conflictBlockedCount === 1 ? " is" : "s are"} currently unavailable because they overlap with another active request or confirmed booking.`
                    : "Active booking conflicts are not blocking any visible slots right now."}
                  {leadTimeBlockedCount > 0
                    ? ` ${leadTimeBlockedCount} more slot${leadTimeBlockedCount === 1 ? " is" : "s are"} blocked because they are less than 25 hours away.`
                    : ""}
                </BookingStatusAlert>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-6">
            <BookingEmptyState
              title="No slots available in the current window"
              description={
                availabilityIssue ||
                (!hasCalendarConnection
                  ? "This therapist has not completed Google Calendar setup yet, so booking slots cannot be shown."
                  : BOOKING_FLOW_MESSAGES.noSlots)
              }
              action={
                <Link
                  href="/client/book/new"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                >
                  Choose another therapist
                </Link>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
