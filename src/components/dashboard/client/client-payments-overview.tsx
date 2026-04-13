import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import { ClientPaymentCard } from "@/components/dashboard/client/client-payment-card";

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
          <article className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/50 p-6 text-sm leading-6 text-slate-600">
            <h3 className="text-lg font-semibold text-slate-900">No payment history yet</h3>
            <p className="mt-2">
              Payment records will appear here as soon as bookings begin generating checkout or settlement activity.
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
