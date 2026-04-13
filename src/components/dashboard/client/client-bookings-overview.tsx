import type { BookingListItem } from "@/lib/contracts/bookings";
import { ClientBookingCard } from "@/components/dashboard/client/client-booking-card";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";

type ClientBookingsOverviewProps = {
  upcomingBookings: BookingListItem[];
  pastBookings: BookingListItem[];
};

export function ClientBookingsOverview({ upcomingBookings, pastBookings }: ClientBookingsOverviewProps) {
  return (
    <div className="grid gap-6">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Client bookings</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Upcoming sessions</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Review the next sessions, watch booking status changes, and open each record for meeting access or cancellation decisions.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{upcomingBookings.length}</span> active booking item{upcomingBookings.length === 1 ? "" : "s"}
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
            />
          )}
        </div>
      </section>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Session archive</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Booking history</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Completed, declined, and cancelled records stay here so the client journey remains easy to trace over time.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{pastBookings.length}</span> archived booking item{pastBookings.length === 1 ? "" : "s"}
          </div>
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
      </section>
    </div>
  );
}
