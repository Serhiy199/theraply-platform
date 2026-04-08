import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function ClientPaymentsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Client billing"
      title="Payments"
      description="This page will show checkout outcomes, payment states, and a traceable history of session charges."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Payment status</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Upcoming session payment readiness and retry states will appear here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">History</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Successful charges, failed attempts, and refunds will be listed in this block.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
