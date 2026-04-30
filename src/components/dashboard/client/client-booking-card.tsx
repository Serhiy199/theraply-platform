import Link from "next/link";
import type { BookingListItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTherapistName(booking: BookingListItem) {
  return (
    booking.therapist.therapistProfile?.displayName ||
    [booking.therapist.firstName, booking.therapist.lastName].filter(Boolean).join(" ") ||
    booking.therapist.email
  );
}

type ClientBookingCardProps = {
  booking: BookingListItem;
};

export function ClientBookingCard({ booking }: ClientBookingCardProps) {
  const therapistName = getTherapistName(booking);
  const paymentStatus = booking.payment?.paymentStatus ?? null;
  const sessionLink = booking.session?.meetingUrl ?? null;

  return (
    <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            Session window
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">{therapistName}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {formatDateTime(booking.startsAt)} to {formatDateTime(booking.endsAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={getBookingStatusBadgeClass(booking.bookingStatus)}>
            {formatBookingStatus(booking.bookingStatus)}
          </Badge>
          {paymentStatus ? (
            <Badge className={getPaymentStatusBadgeClass(paymentStatus)}>
              {formatPaymentStatus(paymentStatus)}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <p className="font-medium text-slate-700">Meeting access</p>
          <p className="mt-1 leading-6">
            {sessionLink ? "Meeting link is ready in the booking details page." : "Meeting link will appear here once the therapist confirms the session."}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
          <p className="font-medium text-slate-700">Latest update</p>
          <p className="mt-1 leading-6">
            Booking record updated {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(booking.updatedAt)}.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Booking ID <span className="font-medium text-slate-700">{booking.id}</span>
        </p>
        <ButtonLink href={`/client/bookings/${booking.id}`} variant="secondary" size="sm">
          View details
        </ButtonLink>
      </div>
    </article>
  );
}
