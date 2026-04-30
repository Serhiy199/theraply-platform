import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import type { getAdminDashboardData } from "@/server/services/dashboard.service";
import { formatAppDateTime } from "@/lib/utils/date-time";
import { Alert } from "@/components/ui/alert";
import { InsetCard, SectionEyebrow, StatCard, SurfaceCard } from "@/components/ui/card";

type FinanceCases = Awaited<ReturnType<typeof getAdminDashboardData>>["financeCases"];

type AdminFinanceCasesProps = {
  cases: FinanceCases;
  payments?: PaymentSummaryItem[];
};

const toneMap = {
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
  success: "success",
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
      ? `Checkout open until ${formatAppDateTime(payment.checkoutExpiresAt)}.`
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
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Financial visibility</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payment cases</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This surface isolates the bookings that typically need finance or operations
            follow-up: pending checkout, failures, refunds, and credit-backed settlements.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        {cases.map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            hint={item.hint}
            className={`px-5 py-4 ${toneMap[item.tone] === "warning" ? "border-amber-200 bg-amber-50/80 text-amber-950" : ""} ${toneMap[item.tone] === "danger" ? "border-rose-200 bg-rose-50/80 text-rose-950" : ""} ${toneMap[item.tone] === "success" ? "border-emerald-200 bg-emerald-50/80 text-emerald-950" : ""} ${toneMap[item.tone] === "neutral" ? "border-slate-200 bg-white/70 text-slate-950" : ""}`}
          />
        ))}
      </div>

      {flaggedPayments.length ? (
        <div className="mt-6 grid gap-3">
          {flaggedPayments.map((payment) => (
            <InsetCard key={payment.id} as="article" tone="soft" className="px-4 py-4">
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
                </div>
              </div>
              <Alert
                tone={
                  payment.paymentStatus === "FAILED"
                    ? "error"
                    : payment.paymentStatus === "REFUNDED"
                      ? "warning"
                      : payment.paymentStatus === "PENDING"
                        ? "info"
                        : "success"
                }
                className="mt-3"
              >
                {getCaseNote(payment)}
              </Alert>
            </InsetCard>
          ))}
        </div>
      ) : null}
    </SurfaceCard>
  );
}
