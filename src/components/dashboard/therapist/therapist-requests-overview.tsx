import type { TherapistRequestItem } from "@/lib/contracts/bookings";
import { TherapistRequestCard } from "@/components/dashboard/therapist/therapist-request-card";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";

type TherapistRequestsOverviewProps = {
  pendingRequests: TherapistRequestItem[];
  upcomingSessions: TherapistRequestItem[];
  pastSessions: TherapistRequestItem[];
};

export function TherapistRequestsOverview({ pendingRequests, upcomingSessions, pastSessions }: TherapistRequestsOverviewProps) {
  return (
    <div className="grid gap-6">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Therapist workflow</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Pending requests</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              New client requests appear here first so the therapist can review the booking, validate the context, and confirm or decline it with a clear operational flow.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{pendingRequests.length}</span> pending request{pendingRequests.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          {pendingRequests.length ? pendingRequests.map((booking) => <TherapistRequestCard key={booking.id} booking={booking} variant="pending" />) : <DashboardEmptyState meta="Therapist requests" title="No pending requests" description="As soon as new client requests arrive, they will land here for confirmation or rejection." />}
        </div>
      </section>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Therapist schedule</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Upcoming sessions</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Confirmed sessions stay visible in chronological order, making it easy to monitor what is next in the working week.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{upcomingSessions.length}</span> scheduled session{upcomingSessions.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          {upcomingSessions.length ? upcomingSessions.map((booking) => <TherapistRequestCard key={booking.id} booking={booking} variant="upcoming" />) : <DashboardEmptyState meta="Therapist schedule" title="No upcoming sessions" description="Confirmed sessions will appear here once bookings move out of the pending queue." />}
        </div>
      </section>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Therapist archive</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Session history</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Past, cancelled, and rejected records remain visible so every client interaction stays traceable across time.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{pastSessions.length}</span> archived session{pastSessions.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-6 grid gap-4">
          {pastSessions.length ? pastSessions.map((booking) => <TherapistRequestCard key={booking.id} booking={booking} variant="history" />) : <DashboardEmptyState meta="Therapist archive" title="No session history yet" description="Historical bookings and declined requests will be grouped here once therapist activity grows." />}
        </div>
      </section>
    </div>
  );
}
