export default function ClientDashboardPage() {
  return (
    <>
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Client Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          This protected area is now mounted inside the shared dashboard shell and is ready to grow
          into the client workspace for bookings, sessions, and payments.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Upcoming sessions</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Phase 4 will show the client&apos;s next confirmed sessions here together with therapist
            details, start times, and quick actions.
          </p>
        </section>
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Payments</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Payment status, checkout history, and invoice-ready data will appear in this block.
          </p>
        </section>
      </div>
    </>
  );
}
