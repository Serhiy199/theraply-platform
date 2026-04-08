import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function AdminPaymentsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Admin oversight"
      title="Payments"
      description="This page will centralize transaction visibility, refund state, and payout-related monitoring for admins."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Transactions</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Successful, pending, failed, and refunded payments will be aggregated here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Payout visibility</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Therapist payout readiness and financial follow-up tasks will appear in this panel.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
