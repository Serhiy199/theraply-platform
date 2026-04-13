import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import { ClientPaymentCard } from "@/components/dashboard/client/client-payment-card";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";

type ClientPaymentsOverviewProps = {
  payments: PaymentSummaryItem[];
};

export function ClientPaymentsOverview({ payments }: ClientPaymentsOverviewProps) {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Client billing</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payments</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Track checkout outcomes, successful charges, refunds, and anything that still needs attention before future sessions go live.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{payments.length}</span> payment record{payments.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {payments.length ? (
          payments.map((payment) => <ClientPaymentCard key={payment.id} payment={payment} />)
        ) : (
          <DashboardEmptyState
            meta="Client billing"
            title="No payment history yet"
            description="Payment records will appear here as soon as bookings begin generating checkout or settlement activity."
          />
        )}
      </div>
    </section>
  );
}
