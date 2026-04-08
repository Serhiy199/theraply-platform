import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function AdminBookingsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Admin oversight"
      title="Bookings"
      description="This section will become the operational table for all booking activity, cancellations, and manual interventions."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Live booking stream</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Confirmed, pending, and cancelled bookings will be grouped here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Manual actions</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Admin overrides and intervention tooling will be connected to this area later.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
