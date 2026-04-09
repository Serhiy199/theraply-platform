import type { getAdminDashboardData } from "@/server/services/dashboard.service";

type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;

type AdminOverviewProps = {
  data: AdminDashboardData;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function getStatValue(data: AdminDashboardData, label: string) {
  return data.stats.find((item) => item.label === label)?.value ?? 0;
}

export function AdminOverview({ data }: AdminOverviewProps) {
  const totalUsers = getStatValue(data, "Users");
  const pendingApprovals = getStatValue(data, "Pending approvals");
  const bookingRecords = getStatValue(data, "Booking records");
  const upcomingBookings = getStatValue(data, "Upcoming bookings");
  const paymentsToReview = getStatValue(data, "Payments to review");
  const verifiedPayouts = getStatValue(data, "Verified payouts");

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Admin Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          The operations console now behaves like a real control panel: user growth, therapist
          approvals, booking visibility, payment pressure, and recent platform activity all sit in
          one place.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Total users
            </p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{totalUsers}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This is the full account footprint across clients, therapists, and admins.
            </p>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Therapists pending approval
            </p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{pendingApprovals}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Profiles waiting on approval should surface here before they can become active supply.
            </p>
          </article>
        </div>
      </section>

      <div className="grid gap-4">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Bookings overview</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Booking records
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{bookingRecords}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                All booking rows currently stored in the system.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Upcoming bookings
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{upcomingBookings}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Future bookings in pending or confirmed state.
              </p>
            </article>
          </div>
        </section>

        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Payments overview</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Payments to review
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{paymentsToReview}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Unpaid, pending, or failed payments needing operational visibility.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Verified payouts
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{verifiedPayouts}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Therapist payout profiles already verified for operations.
              </p>
            </article>
          </div>
        </section>
      </div>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 xl:col-span-2">
        <h3 className="text-xl font-semibold text-slate-900">Recent activity</h3>
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
            No recent platform activity yet. New accounts and operational changes will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
