import { formatDateKeyInTimeZone } from "@/lib/google/google-time-zone";
import type { TherapistListItem } from "@/lib/contracts/booking-flow";
import { BOOKING_FLOW_MESSAGES, BOOKING_FLOW_WINDOW_DAYS } from "@/lib/constants/booking-flow";
import {
  getAvailabilityCountLabel,
  getVisibleAvailabilitySlots,
} from "@/lib/booking-availability-presentation";
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
  const visibleSlots = getVisibleAvailabilitySlots(slots);
  const slotGroups = groupSlotsByDay(visibleSlots);
  const availableCount = visibleSlots.filter((slot) => slot.isAvailable).length;
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
            <SectionEyebrow>Therapist</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">{displayName}</h2>
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

        <div className="mt-6">
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
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div>
          <h2 className="text-3xl font-semibold text-slate-900">Choose an available time</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Available sessions for the next {BOOKING_FLOW_WINDOW_DAYS} days. All times are shown in UK time.
          </p>
        </div>

        <div className="mt-5 rounded-[1.25rem] border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          Sessions must be requested at least 25 hours before the start time so the therapist can confirm them and the payment window still remains valid.
        </div>

        {!hasCalendarConnection ? (
          <div className="mt-5">
            <BookingStatusAlert tone="warning" title="Calendar setup is not complete">
              This therapist has not finished Google Calendar setup yet, so real availability cannot be shown.
            </BookingStatusAlert>
          </div>
        ) : null}
        {availabilityIssue ? (
          <div className="mt-5">
            <BookingStatusAlert tone="warning" title="Availability could not be loaded">
              {availabilityIssue}
            </BookingStatusAlert>
          </div>
        ) : null}

        {slotGroups.length ? (
          <div className="mt-6 grid gap-5">
              {slotGroups.map((group) => (
                <InsetCard key={group.key} as="section" tone="soft">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Availability day</p>
                      <h3 className="mt-2 text-2xl font-semibold text-slate-900">{group.label}</h3>
                    </div>
                    <p className="text-sm text-slate-600">
                      {getAvailabilityCountLabel(group.slots)}
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
