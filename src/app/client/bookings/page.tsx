import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function ClientBookingsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Client bookings"
      title="Bookings"
      description="This section will become the client booking timeline with upcoming sessions, historical sessions, and cancellation actions."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Upcoming sessions</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Confirmed sessions, therapist names, and meeting details will be displayed here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">History</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Completed or cancelled sessions will move into this archive view.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
