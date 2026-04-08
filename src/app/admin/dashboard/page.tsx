import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";
import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";
import { getAdminDashboardData } from "@/server/services/dashboard.service";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData();

  return (
    <>
      <DashboardPlaceholderPage
        eyebrow="Dashboard overview"
        title="Admin Dashboard"
        description="The operations console now reads live data from the database: account growth, therapist readiness, booking volume, and payment visibility."
      />

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {data.stats.map((stat) => (
          <DashboardStatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
        ))}
      </div>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
        <h3 className="text-xl font-semibold text-slate-900">Recent accounts</h3>
        {data.recentUsers.length ? (
          <div className="mt-5 space-y-4">
            {data.recentUsers.map((user) => (
              <article
                key={user.id}
                className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{user.displayName}</p>
                  <p className="mt-1 text-sm text-slate-600">{user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1">{user.role}</span>
                  <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1">
                    {user.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1">
                    {formatDate(user.createdAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-slate-600">
            No recent users yet. Once onboarding continues, the latest accounts will be listed here.
          </p>
        )}
      </section>
    </>
  );
}
