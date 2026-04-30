import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import type { ClientCreditSummary } from "@/server/services/client-credit.service";
import { ClientPaymentCard } from "@/components/dashboard/client/client-payment-card";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

type ClientPaymentsOverviewProps = {
  payments: PaymentSummaryItem[];
  creditSummary: ClientCreditSummary;
};

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ClientPaymentsOverview({
  payments,
  creditSummary,
}: ClientPaymentsOverviewProps) {
  return (
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Client billing</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payments</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            Track checkout outcomes, successful charges, refunds, and anything that still
            needs attention before future sessions go live.
          </p>
        </div>
        <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
          <span className="font-semibold text-slate-900">{payments.length}</span> payment
          record{payments.length === 1 ? "" : "s"}
        </InsetCard>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <InsetCard as="article" tone="soft">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Client credit
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">
            {formatAmount(creditSummary.balance, creditSummary.currency)}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Available credit is applied automatically to future confirmed sessions before
            Stripe Checkout charges the remaining balance.
          </p>
        </InsetCard>

        <InsetCard as="article" tone="soft">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Recent credit activity
          </p>
          <div className="mt-4 grid gap-3">
            {creditSummary.recentTransactions.length ? (
              creditSummary.recentTransactions.map((transaction) => (
                <InsetCard
                  key={transaction.id}
                  as="div"
                  tone="muted"
                  className="rounded-[1.25rem] px-4 py-3 shadow-none"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">
                        {transaction.type.toLowerCase()}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {transaction.notes ?? "No additional note recorded."}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        {formatAmount(transaction.amount, transaction.currency)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(transaction.createdAt)}
                      </p>
                    </div>
                  </div>
                </InsetCard>
              ))
            ) : (
              <DashboardEmptyState
                meta="Client credit"
                title="No credit activity yet"
                description="Issued, applied, and reversed platform credits will start appearing here as soon as they are used in the payment flow."
              />
            )}
          </div>
        </InsetCard>
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
    </SurfaceCard>
  );
}
