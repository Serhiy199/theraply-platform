import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function AdminTherapistsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Admin oversight"
      title="Therapists"
      description="This page will track therapist approval state, profile readiness, and payout setup across the platform."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Approval queue</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Pending therapists and profile review actions will appear in this queue.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Operational readiness</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Calendar setup, payout completeness, and therapist availability health will be shown here.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
