import { requireRole } from "@/lib/permissions";
import { UserRole } from "@prisma/client";
import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";
import { getClientDashboardData } from "@/server/services/dashboard.service";

function formatDate(date: Date | null) {
  if (!date) return "Not available yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function ClientDashboardPage() {
  const user = await requireRole([UserRole.CLIENT]);
  const data = await getClientDashboardData(user.id);

  return (
    <>
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Client Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Your workspace now reads live platform data: account readiness, booking volume, upcoming
          sessions, and payment follow-up opportunities.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {data.stats.map((stat) => (
          <DashboardStatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Account snapshot</h3>
          <dl className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Client profile</dt>
              <dd className="text-right">{data.accountSummary.displayName ?? "Profile pending"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Email</dt>
              <dd className="text-right">{data.accountSummary.email ?? user.email ?? "Unknown"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Member since</dt>
              <dd className="text-right">{formatDate(data.accountSummary.memberSince)}</dd>
            </div>
          </dl>
        </section>

        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Recent booking activity</h3>
          {data.recentBookings.length ? (
            <div className="mt-5 space-y-4">
              {data.recentBookings.map((booking) => (
                <article key={booking.id} className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
                  <p className="text-sm font-semibold text-slate-900">{booking.therapistName}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatDateTime(booking.startsAt)}</p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    {booking.status.replaceAll("_", " ")}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-slate-600">
              No booking records yet. Once booking flows are connected, this panel will show the next
              therapist sessions and the latest booking status changes.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
