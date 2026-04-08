export default function TherapistDashboardPage() {
  return (
    <>
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Therapist Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          The therapist workspace now shares the same shell and is ready for booking requests,
          upcoming sessions, and Google Calendar-driven availability.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Incoming requests</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            New booking requests and confirmation actions will appear here once the booking workflow
            is connected.
          </p>
        </section>
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Calendar sync</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Google Calendar availability, upcoming slots, and session scheduling context will live in
            this block.
          </p>
        </section>
      </div>
    </>
  );
}
