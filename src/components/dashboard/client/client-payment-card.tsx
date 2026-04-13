import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";

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
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getPaymentStatusBadgeClass(payment.paymentStatus)}`}>
          {formatPaymentStatus(payment.paymentStatus)}
        </span>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getBookingStatusBadgeClass(payment.booking.bookingStatus)}`}>
          {formatBookingStatus(payment.booking.bookingStatus)}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
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
    </article>
  );
}
