import type { AdminBookingRow } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import { formatAppDateTime } from "@/lib/utils/date-time";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

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
      ? `Checkout open until ${formatAppDateTime(booking.payment.checkoutExpiresAt)}`
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
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Admin oversight</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Bookings</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This operational stream shows all booking activity across clients and
            therapists, including status, payment visibility, and manual intervention entry
            points.
          </p>
        </div>
        <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
          <span className="font-semibold text-slate-900">{bookings.length}</span> booking
          record{bookings.length === 1 ? "" : "s"}
        </InsetCard>
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
                      <p className="font-semibold text-slate-900">{formatAppDateTime(booking.startsAt)}</p>
                      <p className="mt-1 text-slate-600">to {formatAppDateTime(booking.endsAt)}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                        ID {booking.id}
                      </p>
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
                        <Badge className={getBookingStatusBadgeClass(booking.bookingStatus)}>
                          {formatBookingStatus(booking.bookingStatus)}
                        </Badge>
                        {booking.cancelledAt ? (
                          <span className="text-xs text-slate-500">
                            Cancelled {formatAppDateTime(booking.cancelledAt)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        {paymentStatus ? (
                          <Badge className={getPaymentStatusBadgeClass(paymentStatus)}>
                            {formatPaymentStatus(paymentStatus)}
                          </Badge>
                        ) : (
                          <span className="text-slate-500">No payment</span>
                        )}
                        {financeSignal ? (
                          <span className="text-xs leading-5 text-slate-500">{financeSignal}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatAppDateTime(booking.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <ButtonLink href={`/admin/bookings/${booking.id}`} variant="secondary" size="sm">
                        View details
                      </ButtonLink>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <DashboardEmptyState
          meta="Admin bookings"
          title="No bookings yet"
          description="Booking traffic will appear here as soon as client requests and therapist scheduling activity begin flowing through the platform."
        />
      )}
    </SurfaceCard>
  );
}
