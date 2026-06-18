import type { BookingListItem } from "@/lib/contracts/bookings";
import { ClientBookingCard } from "@/components/dashboard/client/client-booking-card";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

type ClientBookingsOverviewProps = {
  upcomingBookings: BookingListItem[];
  pastBookings: BookingListItem[];
};

export function ClientBookingsOverview({ upcomingBookings, pastBookings }: ClientBookingsOverviewProps) {
  return (
    <div className="grid gap-6">
      <SurfaceCard as="section">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <SectionEyebrow>Client bookings</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Upcoming sessions</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Review the next sessions, watch booking status changes, and open each record for meeting access or cancellation decisions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
              <span className="font-semibold text-slate-900">{upcomingBookings.length}</span> active booking item{upcomingBookings.length === 1 ? "" : "s"}
            </InsetCard>
            <ButtonLink href="/client/book/new">
              Book a new session
            </ButtonLink>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {upcomingBookings.length ? (
            upcomingBookings.map((booking) => <ClientBookingCard key={booking.id} booking={booking} />)
          ) : (
            <DashboardEmptyState
              meta="Client bookings"
              title="No upcoming sessions yet"
              description="As soon as confirmed or pending requests exist for this account, they will appear here with therapist details and payment status."
              action={
                <ButtonLink href="/client/book/new" size="sm">
                  Book your first session
                </ButtonLink>
              }
            />
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard as="section">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionEyebrow>Session archive</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Booking history</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Completed, declined, and cancelled records stay here so the client journey remains easy to trace over time.
            </p>
          </div>
          <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
            <span className="font-semibold text-slate-900">{pastBookings.length}</span> archived booking item{pastBookings.length === 1 ? "" : "s"}
          </InsetCard>
        </div>

        <div className="mt-6 grid gap-4">
          {pastBookings.length ? (
            pastBookings.map((booking) => <ClientBookingCard key={booking.id} booking={booking} />)
          ) : (
            <DashboardEmptyState
              meta="Client archive"
              title="No historical sessions yet"
              description="Past sessions and cancelled requests will move into this archive automatically once activity starts flowing through the platform."
            />
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
