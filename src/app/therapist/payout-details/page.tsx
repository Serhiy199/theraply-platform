import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function TherapistPayoutDetailsPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Therapist finance"
      title="Payout Details"
      description="This page will host therapist payout settings, verification state, and banking profile readiness."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Banking profile</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Account holder, IBAN, SWIFT, and verification state will be editable here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Verification</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Admin review status and missing payout information will be highlighted in this block.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
