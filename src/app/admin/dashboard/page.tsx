export default function AdminDashboardPage() {
  return (
    <>
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Admin Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          The operational console now lives inside the shared shell and is ready for user oversight,
          therapist management, bookings, and payment visibility.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Platform monitoring</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Booking activity, audit logs, and email delivery checks will surface here in the next
            dashboard iteration.
          </p>
        </section>
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Management tools</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Therapist approvals, payout details, and manual booking actions will be added next.
          </p>
        </section>
      </div>
    </>
  );
}
