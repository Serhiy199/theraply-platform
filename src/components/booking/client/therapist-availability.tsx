import { formatDateKeyInTimeZone } from "@/lib/google/google-time-zone";
import { DEFAULT_APP_TIME_ZONE } from "@/lib/time-zone";
import type { TherapistListItem } from "@/lib/contracts/booking-flow";
import { BOOKING_FLOW_MESSAGES, BOOKING_FLOW_WINDOW_DAYS } from "@/lib/constants/booking-flow";
import type { TherapistAvailabilitySlot } from "@/server/services/booking-flow.service";
import { SlotCard } from "@/components/booking/client/slot-card";
import { BookingEmptyState } from "@/components/booking/client/booking-empty-state";
import { BookingStatusAlert } from "@/components/booking/client/booking-status-alert";
import { TherapistProfilePhoto } from "@/components/booking/client/therapist-profile-photo";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

function getDisplayName(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.displayName ||
    [therapist.firstName, therapist.lastName].filter(Boolean).join(" ") ||
    therapist.email
  );
}

function getSpecialisation(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.specialisation ||
    therapist.therapistProfile?.specialization ||
    "To be defined"
  );
}

function getProfileSummary(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.bio ||
    therapist.therapistProfile?.therapyServicesProvided ||
    "Profile details will expand as therapist onboarding continues."
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

function formatHourlyRate(value: number | null | undefined) {
  const formatted = formatCurrency(value);

  return formatted.startsWith("Price") ? formatted : `${formatted}/hour`;
}

function getExperienceLabel(therapist: TherapistListItem) {
  const yearsOfExperience = therapist.therapistProfile?.yearsOfExperience?.trim();

  if (!yearsOfExperience) {
    return null;
  }

  const hasYearText = /year|yr/i.test(yearsOfExperience);

  return hasYearText ? yearsOfExperience : `${yearsOfExperience} years of experience`;
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
  const displayTimeZone = slots[0]?.timeZone ?? DEFAULT_APP_TIME_ZONE;
  const hasCalendarConnection = Boolean(
    therapist.therapistProfile?.isGoogleCalendarConnected &&
      therapist.therapistProfile?.googleCalendarId,
  );
  const displayName = getDisplayName(therapist);
  const experienceLabel = getExperienceLabel(therapist);
  const profilePhotoUrl = therapist.therapistProfile?.profilePhotoUrl;

  return (
    <div className="grid gap-6">
      <SurfaceCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>Client booking flow</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Available slots for {displayName}</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Pick a time that works for you. The booking request will be sent to the therapist and remain pending until they confirm it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <InsetCard as="div" tone="plain" className="rounded-[1.5rem] px-4 py-3 text-sm text-slate-600 shadow-none">
              <span className="font-semibold text-slate-900">{availableCount}</span> available slot{availableCount === 1 ? "" : "s"}
            </InsetCard>
            <ButtonLink href="/client/book/new" variant="secondary" size="sm">
              Change therapist
            </ButtonLink>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <InsetCard tone="soft">
            <div className="grid gap-5 sm:grid-cols-[230px_minmax(0,1fr)] sm:items-start">
              <TherapistProfilePhoto
                displayName={displayName}
                profilePhotoUrl={profilePhotoUrl}
                className="h-[230px] min-h-[230px] w-full text-5xl sm:w-[230px]"
              />

              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Therapist profile
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">{displayName}</h3>
                {experienceLabel ? (
                  <p className="mt-1 text-sm leading-6 text-slate-600">{experienceLabel}</p>
                ) : null}
                <p className="mt-3 text-base font-semibold leading-6 text-sky-700">
                  {formatHourlyRate(therapist.therapistProfile?.sessionPricePence)}
                </p>
                <p className="mt-5 text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">
                  {getSpecialisation(therapist)}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                  {getProfileSummary(therapist)}
                </p>
              </div>
            </div>
          </InsetCard>

          <InsetCard tone="soft">
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
              All times are shown in UK time.
              <span className="ml-1 font-semibold text-slate-900">({displayTimeZone})</span>
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
          </InsetCard>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionEyebrow>Therapist availability</SectionEyebrow>
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
                <InsetCard key={group.key} as="section" tone="soft">
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
                </InsetCard>
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
                <ButtonLink href="/client/book/new" variant="secondary" size="sm">
                  Choose another therapist
                </ButtonLink>
              }
            />
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
