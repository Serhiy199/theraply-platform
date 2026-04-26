import Link from "next/link";
import type { AdminBookingRow } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getClientName(booking: AdminBookingRow) {
  return [booking.client.firstName, booking.client.lastName].filter(Boolean).join(" ") || booking.client.email;
}

function getTherapistName(booking: AdminBookingRow) {
  return (
    booking.therapist.therapistProfile?.displayName ||
    [booking.therapist.firstName, booking.therapist.lastName].filter(Boolean).join(" ") ||
    booking.therapist.email
  );
}

function getFinanceSignal(booking: AdminBookingRow) {
  if (!booking.payment) {
    return null;
  }

  if (booking.payment.paymentStatus === "FAILED") {
    return booking.payment.failedReason || "Failed payment";
  }

  if (booking.payment.paymentStatus === "REFUNDED") {
    return booking.payment.refundReason || "Refund completed";
  }

  if (booking.payment.paymentStatus === "PENDING") {
    return booking.payment.checkoutExpiresAt
      ? `Checkout open until ${formatDateTime(booking.payment.checkoutExpiresAt)}`
      : "Pending checkout";
  }

  if (booking.payment.creditAppliedAmount) {
    return `Client credit applied: ${new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: booking.payment.currency.toUpperCase(),
    }).format(booking.payment.creditAppliedAmount / 100)}`;
  }

  return null;
}

type AdminBookingsTableProps = {
  bookings: AdminBookingRow[];
};

export function AdminBookingsTable({ bookings }: AdminBookingsTableProps) {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Admin oversight</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Bookings</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This operational stream shows all booking activity across clients and therapists, including status, payment visibility, and manual intervention entry points.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{bookings.length}</span> booking record{bookings.length === 1 ? "" : "s"}
        </div>
      </div>

      {bookings.length ? (
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Session</th>
                <th className="px-5 py-4">Client</th>
                <th className="px-5 py-4">Therapist</th>
                <th className="px-5 py-4">Booking</th>
                <th className="px-5 py-4">Payment</th>
                <th className="px-5 py-4">Updated</th>
                <th className="px-5 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {bookings.map((booking) => {
                const paymentStatus = booking.payment?.paymentStatus ?? null;
                const financeSignal = getFinanceSignal(booking);

                return (
                  <tr key={booking.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{formatDateTime(booking.startsAt)}</p>
                      <p className="mt-1 text-slate-600">to {formatDateTime(booking.endsAt)}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">ID {booking.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{getClientName(booking)}</p>
                      <p className="mt-1 text-slate-600">{booking.client.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{getTherapistName(booking)}</p>
                      <p className="mt-1 text-slate-600">{booking.therapist.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getBookingStatusBadgeClass(booking.bookingStatus)}`}>
                          {formatBookingStatus(booking.bookingStatus)}
                        </span>
                        {booking.cancelledAt ? (
                          <span className="text-xs text-slate-500">Cancelled {formatDateTime(booking.cancelledAt)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        {paymentStatus ? (
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getPaymentStatusBadgeClass(paymentStatus)}`}>
                            {formatPaymentStatus(paymentStatus)}
                          </span>
                        ) : (
                          <span className="text-slate-500">No payment</span>
                        )}
                        {financeSignal ? (
                          <span className="text-xs leading-5 text-slate-500">{financeSignal}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(booking.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <Link href={`/admin/bookings/${booking.id}`} className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400">
                        View details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <DashboardEmptyState meta="Admin bookings" title="No bookings yet" description="Booking traffic will appear here as soon as client requests and therapist scheduling activity begin flowing through the platform." />}
    </section>
  );
}
