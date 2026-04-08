import { UserRole } from "@prisma/client";
import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";
import { requireRole } from "@/lib/permissions";
import { getTherapistDashboardData } from "@/server/services/dashboard.service";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function TherapistDashboardPage() {
  const user = await requireRole([UserRole.THERAPIST]);
  const data = await getTherapistDashboardData(user.id);

  return (
    <>
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Therapist Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          This workspace now reads live operational data: request volume, future sessions, client
          relationships, and profile readiness for payout and calendar setup.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {data.stats.map((stat) => (
          <DashboardStatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Profile readiness</h3>
          <dl className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Display name</dt>
              <dd className="text-right">{data.profileSummary.displayName ?? user.email ?? "Pending"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Specialization</dt>
              <dd className="text-right">{data.profileSummary.specialization ?? "Not added yet"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Approval status</dt>
              <dd className="text-right">{data.profileSummary.approvalStatus ?? "Pending"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Calendar</dt>
              <dd className="text-right">{data.profileSummary.calendarEmail ?? "Not connected yet"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Payout country</dt>
              <dd className="text-right">{data.profileSummary.payoutCountry ?? "Not set"}</dd>
            </div>
          </dl>
        </section>

        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Pending request queue</h3>
          {data.recentRequests.length ? (
            <div className="mt-5 space-y-4">
              {data.recentRequests.map((booking) => (
                <article key={booking.id} className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
                  <p className="text-sm font-semibold text-slate-900">{booking.clientName}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatDateTime(booking.startsAt)}</p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    {booking.status.replaceAll("_", " ")}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-slate-600">
              No pending requests yet. Once clients start booking, this queue will surface the most
              urgent items first.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
