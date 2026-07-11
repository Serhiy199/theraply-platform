import type { TherapistListItem } from "@/lib/contracts/booking-flow";
import { BOOKING_FLOW_MESSAGES } from "@/lib/constants/booking-flow";
import { TherapistCard } from "@/components/booking/client/therapist-card";
import { BookingEmptyState } from "@/components/booking/client/booking-empty-state";
import { BookingStatusAlert } from "@/components/booking/client/booking-status-alert";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

type TherapistPickerProps = {
  therapists: TherapistListItem[];
};

export function TherapistPicker({ therapists }: TherapistPickerProps) {
  return (
    <section className="grid gap-6">
      <SurfaceCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionEyebrow>Client booking flow</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Choose a therapist</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Start a new booking request by choosing the therapist you want to work with. The next step will show available slots in the current booking window.
            </p>
          </div>
          <InsetCard as="div" tone="plain" className="rounded-[1.5rem] px-4 py-3 text-sm text-slate-600 shadow-none">
            <span className="font-semibold text-slate-900">{therapists.length}</span> bookable therapist{therapists.length === 1 ? "" : "s"}
          </InsetCard>
        </div>

        {therapists.length ? (
          <div className="mt-6">
            <BookingStatusAlert title="Choose the best fit">
              Select a therapist to continue into slot selection. Booking requests are created on the next step and stay pending until the therapist responds.
            </BookingStatusAlert>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5">
          {therapists.length ? (
            therapists.map((therapist) => <TherapistCard key={therapist.id} therapist={therapist} />)
          ) : (
            <div>
              <BookingEmptyState
                title="No therapists available right now"
                description={BOOKING_FLOW_MESSAGES.noTherapists}
                action={
                  <ButtonLink href="/client/bookings" variant="secondary" size="sm">
                    Back to bookings
                  </ButtonLink>
                }
              />
            </div>
          )}
        </div>
      </SurfaceCard>
    </section>
  );
}
