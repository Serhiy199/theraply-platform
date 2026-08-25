import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import { resolvePaymentFinancialSnapshot } from "@/lib/promo-code";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import { formatAppDateTime } from "@/lib/utils/date-time";
import { Badge } from "@/components/ui/badge";
import { InsetCard } from "@/components/ui/card";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function getPaymentOutcomeNote(payment: PaymentSummaryItem) {
  const creditNote = payment.creditAppliedAmount
    ? `Client credit applied: ${formatAmount(payment.creditAppliedAmount, payment.currency)}. `
    : "";

  if (payment.paymentStatus === "FAILED") {
    return `${creditNote}${payment.failedReason || "The payment attempt did not complete successfully."}`.trim();
  }

  if (payment.paymentStatus === "REFUNDED") {
    return `${creditNote}${payment.refundReason || "The payment was refunded through Stripe."}`.trim();
  }

  if (payment.paymentStatus === "PENDING") {
    const pendingNote = payment.checkoutExpiresAt
      ? `Checkout is still pending and is expected to expire on ${formatAppDateTime(payment.checkoutExpiresAt)}.`
      : "Checkout was started but has not been finalized yet.";

    return `${creditNote}${pendingNote}`.trim();
  }

  return creditNote.trim() || null;
}

function getTherapistName(payment: PaymentSummaryItem) {
  return (
    payment.booking.therapist.therapistProfile?.displayName ||
    [payment.booking.therapist.firstName, payment.booking.therapist.lastName]
      .filter(Boolean)
      .join(" ") ||
    payment.booking.therapist.email
  );
}

type ClientPaymentCardProps = {
  payment: PaymentSummaryItem;
};

export function ClientPaymentCard({ payment }: ClientPaymentCardProps) {
  const paymentOutcomeNote = getPaymentOutcomeNote(payment);
  let financialSnapshot: ReturnType<typeof resolvePaymentFinancialSnapshot> | null = null;

  try {
    financialSnapshot = resolvePaymentFinancialSnapshot(payment);
  } catch {
    financialSnapshot = null;
  }

  const promoDiscountAmount = financialSnapshot?.promoDiscountAmount ?? 0;
  const clientPayableAmount = financialSnapshot?.clientPayableAmount ?? payment.amount;
  const stripeChargeAmount =
    financialSnapshot?.stripeChargeAmount ??
    Math.max(0, payment.amount - (payment.creditAppliedAmount ?? 0));

  return (
    <InsetCard as="article" tone="soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Payment record</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{getTherapistName(payment)}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Session window: {formatAppDateTime(payment.booking.startsAt)} to {formatAppDateTime(payment.booking.endsAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Amount charged</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatAmount(stripeChargeAmount, payment.currency)}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Badge className={getPaymentStatusBadgeClass(payment.paymentStatus)}>
          {formatPaymentStatus(payment.paymentStatus)}
        </Badge>
        <Badge className={getBookingStatusBadgeClass(payment.booking.bookingStatus)}>
          {formatBookingStatus(payment.booking.bookingStatus)}
        </Badge>
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Original session price</dt>
          <dd className="mt-1">{formatAmount(payment.amount, payment.currency)}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Promo code</dt>
          <dd className="mt-1">{payment.promoCodeSnapshot ?? "None"}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Promo discount</dt>
          <dd className="mt-1">-{formatAmount(promoDiscountAmount, payment.currency)}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Client payable</dt>
          <dd className="mt-1">{formatAmount(clientPayableAmount, payment.currency)}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Client credit applied</dt>
          <dd className="mt-1">{formatAmount(payment.creditAppliedAmount ?? 0, payment.currency)}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Paid at</dt>
          <dd className="mt-1">{formatAppDateTime(payment.paidAt)}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
          <dt className="font-medium text-slate-700">Failed at</dt>
          <dd className="mt-1">{formatAppDateTime(payment.failedAt)}</dd>
        </InsetCard>
        <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none md:col-span-2">
          <dt className="font-medium text-slate-700">Refunded at</dt>
          <dd className="mt-1">{formatAppDateTime(payment.refundedAt)}</dd>
        </InsetCard>
      </dl>

      {paymentOutcomeNote ? (
        <InsetCard as="div" tone="muted" className="mt-4 rounded-[1.25rem] px-4 py-3 text-sm leading-6 text-slate-600 shadow-none">
          {paymentOutcomeNote}
        </InsetCard>
      ) : null}
    </InsetCard>
  );
}
