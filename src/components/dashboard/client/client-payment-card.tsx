import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import { Badge } from "@/components/ui/badge";

function formatDateTime(date: Date | null) {
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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
      ? `Checkout is still pending and is expected to expire on ${formatDateTime(payment.checkoutExpiresAt)}.`
      : "Checkout was started but has not been finalized yet.";

    return `${creditNote}${pendingNote}`.trim();
  }

  return creditNote.trim() || null;
}

function getTherapistName(payment: PaymentSummaryItem) {
  return (
    payment.booking.therapist.therapistProfile?.displayName ||
    [payment.booking.therapist.firstName, payment.booking.therapist.lastName].filter(Boolean).join(" ") ||
    payment.booking.therapist.email
  );
}

type ClientPaymentCardProps = {
  payment: PaymentSummaryItem;
};

export function ClientPaymentCard({ payment }: ClientPaymentCardProps) {
  const paymentOutcomeNote = getPaymentOutcomeNote(payment);

  return (
    <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Payment record</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{getTherapistName(payment)}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Session window: {formatDateTime(payment.booking.startsAt)} to {formatDateTime(payment.booking.endsAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Amount</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatAmount(payment.amount, payment.currency)}</p>
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
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <dt className="font-medium text-slate-700">Client credit applied</dt>
          <dd className="mt-1">
            {formatAmount(payment.creditAppliedAmount ?? 0, payment.currency)}
          </dd>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <dt className="font-medium text-slate-700">Paid at</dt>
          <dd className="mt-1">{formatDateTime(payment.paidAt)}</dd>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <dt className="font-medium text-slate-700">Failed at</dt>
          <dd className="mt-1">{formatDateTime(payment.failedAt)}</dd>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3 md:col-span-2">
          <dt className="font-medium text-slate-700">Refunded at</dt>
          <dd className="mt-1">{formatDateTime(payment.refundedAt)}</dd>
        </div>
      </dl>

      {paymentOutcomeNote ? (
        <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
          {paymentOutcomeNote}
        </div>
      ) : null}
    </article>
  );
}
