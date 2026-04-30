import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import type { PaymentSummaryItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

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

function getPaymentIncidentSummary(payment: PaymentSummaryItem) {
  const creditNote = payment.creditAppliedAmount
    ? `Client credit applied: ${formatAmount(payment.creditAppliedAmount, payment.currency)}. `
    : "";

  if (payment.paymentStatus === "FAILED") {
    return `${creditNote}${payment.failedReason || "Stripe reported a failed payment attempt."}`.trim();
  }

  if (payment.paymentStatus === "REFUNDED") {
    return `${creditNote}${payment.refundReason || "Stripe completed a refund."}`.trim();
  }

  if (payment.paymentStatus === "PENDING") {
    const pendingNote = payment.checkoutExpiresAt
      ? `Open until ${formatDateTime(payment.checkoutExpiresAt)}`
      : "Checkout started but not completed";

    return `${creditNote}${pendingNote}`.trim();
  }

  if (payment.paymentStatus === "PAID") {
    return `${creditNote}Payment cleared`.trim();
  }

  return `${creditNote}No incident recorded`.trim();
}

type AdminPaymentsTableProps = {
  payments: PaymentSummaryItem[];
};

export function AdminPaymentsTable({ payments }: AdminPaymentsTableProps) {
  return (
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Admin oversight</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payments</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This table centralizes payment visibility for the operations team, including
            booking references, therapist context, and settlement status.
          </p>
        </div>
        <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
          <span className="font-semibold text-slate-900">{payments.length}</span> payment
          record{payments.length === 1 ? "" : "s"}
        </InsetCard>
      </div>

      {payments.length ? (
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Booking</th>
                <th className="px-5 py-4">Therapist</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">Payment</th>
                <th className="px-5 py-4">Booking state</th>
                <th className="px-5 py-4">Paid</th>
                <th className="px-5 py-4">Refunded</th>
                <th className="px-5 py-4">Stripe note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {payments.map((payment) => (
                <tr key={payment.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{formatDateTime(payment.booking.startsAt)}</p>
                    <p className="mt-1 text-slate-600">to {formatDateTime(payment.booking.endsAt)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      Booking {payment.booking.id}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{getTherapistName(payment)}</p>
                    <p className="mt-1 text-slate-600">{payment.booking.therapist.email}</p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {formatAmount(payment.amount, payment.currency)}
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={getPaymentStatusBadgeClass(payment.paymentStatus)}>
                      {formatPaymentStatus(payment.paymentStatus)}
                    </Badge>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {payment.checkoutExpiresAt && payment.paymentStatus === "PENDING"
                        ? `Expires ${formatDateTime(payment.checkoutExpiresAt)}`
                        : "\u00A0"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={getBookingStatusBadgeClass(payment.booking.bookingStatus)}>
                      {formatBookingStatus(payment.booking.bookingStatus)}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDateTime(payment.paidAt)}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDateTime(payment.refundedAt)}</td>
                  <td className="px-5 py-4 text-slate-600">{getPaymentIncidentSummary(payment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6">
          <DashboardEmptyState
            meta="Admin oversight"
            title="No payment records yet"
            description="Payments will appear here as soon as booking records begin generating billing events or checkout activity."
          />
        </div>
      )}
    </SurfaceCard>
  );
}
