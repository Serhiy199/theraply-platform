import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function TherapistClientsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Therapist relationships"
      title="Clients"
      description="This view will gather active clients, recent sessions, and relationship history for therapist workflows."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Active clients</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Ongoing client relationships and their next appointments will be listed here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Recent activity</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Session history and notes-related activity will surface in this panel later.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
