import Link from "next/link";
import type { TherapistRequestItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getClientName(booking: TherapistRequestItem) {
  return [booking.client.firstName, booking.client.lastName].filter(Boolean).join(" ") || booking.client.email;
}

type TherapistRequestCardProps = {
  booking: TherapistRequestItem;
  variant: "pending" | "upcoming" | "history";
};

export function TherapistRequestCard({ booking, variant }: TherapistRequestCardProps) {
  const paymentStatus = booking.payment?.paymentStatus ?? null;
  const clientName = getClientName(booking);

  return (
    <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            {variant === "pending" ? "New request" : variant === "upcoming" ? "Scheduled session" : "Session history"}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{clientName}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {formatDateTime(booking.startsAt)} to {formatDateTime(booking.endsAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getBookingStatusBadgeClass(booking.bookingStatus)}`}>
            {formatBookingStatus(booking.bookingStatus)}
          </span>
          {paymentStatus ? (
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getPaymentStatusBadgeClass(paymentStatus)}`}>
              {formatPaymentStatus(paymentStatus)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <p className="font-medium text-slate-700">Client email</p>
          <p className="mt-1 leading-6">{booking.client.email}</p>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <p className="font-medium text-slate-700">Meeting access</p>
          <p className="mt-1 leading-6">
            {booking.session?.meetingUrl ? "Meeting link already prepared." : "Meeting link will appear after confirmation and scheduling."}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Request ID <span className="font-medium text-slate-700">{booking.id}</span></p>
        <Link
          href={`/therapist/requests/${booking.id}`}
          className="inline-flex items-center rounded-full border border-[var(--border-medium)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          Review details
        </Link>
      </div>
    </article>
  );
}
