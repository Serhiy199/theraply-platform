import type { getAdminDashboardData } from "@/server/services/dashboard.service";
import type { PaymentSummaryItem } from "@/lib/contracts/bookings";

type FinanceCases = Awaited<ReturnType<typeof getAdminDashboardData>>["financeCases"];

type AdminFinanceCasesProps = {
  cases: FinanceCases;
  payments?: PaymentSummaryItem[];
};

const toneClasses = {
  warning: "border-amber-200 bg-amber-50/80 text-amber-950",
  danger: "border-rose-200 bg-rose-50/80 text-rose-950",
  neutral: "border-slate-200 bg-white/70 text-slate-950",
  success: "border-emerald-200 bg-emerald-50/80 text-emerald-950",
} as const;

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function getCaseNote(payment: PaymentSummaryItem) {
  if (payment.paymentStatus === "FAILED") {
    return payment.failedReason || "Stripe reported a failed payment attempt.";
  }

  if (payment.paymentStatus === "REFUNDED") {
    return payment.refundReason || "Stripe completed a refund for this booking.";
  }

  if (payment.paymentStatus === "PENDING") {
    return payment.checkoutExpiresAt
      ? `Checkout open until ${new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(payment.checkoutExpiresAt)}.`
      : "Checkout has started but not finished yet.";
  }

  if (payment.creditAppliedAmount) {
    return `Client credit applied: ${formatAmount(payment.creditAppliedAmount, payment.currency)}.`;
  }

  return "Operational payment case.";
}

function getFlaggedPayments(payments: PaymentSummaryItem[]) {
  return payments
    .filter(
      (payment) =>
        payment.paymentStatus === "PENDING" ||
        payment.paymentStatus === "FAILED" ||
        payment.paymentStatus === "REFUNDED" ||
        Boolean(payment.creditAppliedAmount && payment.creditAppliedAmount > 0),
    )
    .slice(0, 5);
}

export function AdminFinanceCases({ cases, payments = [] }: AdminFinanceCasesProps) {
  const flaggedPayments = getFlaggedPayments(payments);

  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Financial visibility
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payment cases</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This surface isolates the bookings that typically need finance or operations follow-up:
            pending checkout, failures, refunds, and credit-backed settlements.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        {cases.map((item) => (
          <article
            key={item.label}
            className={`rounded-[1.5rem] border px-5 py-4 ${toneClasses[item.tone]}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
              {item.label}
            </p>
            <p className="mt-3 text-3xl font-semibold">{item.value}</p>
            <p className="mt-2 text-sm leading-6 opacity-80">{item.hint}</p>
          </article>
        ))}
      </div>

      {flaggedPayments.length ? (
        <div className="mt-6 grid gap-3">
          {flaggedPayments.map((payment) => (
            <article
              key={payment.id}
              className="rounded-[1.5rem] border border-slate-200/70 bg-white/70 px-4 py-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Booking {payment.booking.id}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {payment.booking.therapist.therapistProfile?.displayName ||
                      payment.booking.therapist.email}
                  </p>
                </div>
                <div className="text-left lg:text-right">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatAmount(payment.amount, payment.currency)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{getCaseNote(payment)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
