import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function TherapistRequestsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Therapist workflow"
      title="Requests"
      description="Incoming booking requests will land here so therapists can review, confirm, or decline them."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Pending confirmation</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          New client requests and session windows will appear in this queue.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Decision history</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Confirmed and declined requests will be grouped for quick review.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
