"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { BookingDetailsItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getPaymentStatusBadgeClass,
} from "@/lib/utils/format-booking";
import {
  adminCancelBookingAction,
  type AdminCancelBookingActionState,
} from "@/app/admin/bookings/actions";
import { GoogleCalendarMeetingStatus } from "@/components/dashboard/shared/google-calendar-status";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";
import { Button } from "@/components/ui/button";

function formatDateTime(date: Date | null) {
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getClientName(booking: BookingDetailsItem) {
  return [booking.client.firstName, booking.client.lastName].filter(Boolean).join(" ") || booking.client.email;
}

function getTherapistName(booking: BookingDetailsItem) {
  return (
    booking.therapist.therapistProfile?.displayName ||
    [booking.therapist.firstName, booking.therapist.lastName].filter(Boolean).join(" ") ||
    booking.therapist.email
  );
}

function getPaymentIncidentSummary(booking: BookingDetailsItem) {
  if (!booking.payment) {
    return "No payment record has been created yet.";
  }

  if (booking.payment.paymentStatus === "FAILED") {
    return booking.payment.failedReason || "Stripe reported a failed payment attempt.";
  }

  if (booking.payment.paymentStatus === "REFUNDED") {
    return booking.payment.refundReason || "Stripe completed a refund for this booking.";
  }

  if (booking.payment.paymentStatus === "PENDING") {
    return booking.payment.checkoutExpiresAt
      ? `Checkout remains open until approximately ${formatDateTime(booking.payment.checkoutExpiresAt)}.`
      : "Checkout has started but has not completed yet.";
  }

  if (booking.payment.paymentStatus === "PAID") {
    return "Stripe confirmed payment for this booking.";
  }

  return "No payment incident has been recorded.";
}

function ManualCancelForm({ bookingId }: { bookingId: string }) {
  const initialAdminCancelBookingActionState: AdminCancelBookingActionState = {
    status: "idle",
  };
  const [state, formAction, pending] = useActionState<AdminCancelBookingActionState, FormData>(
    adminCancelBookingAction,
    initialAdminCancelBookingActionState,
  );

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.message ? (
        <div className={`rounded-[1.25rem] border px-4 py-3 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {state.message}
        </div>
      ) : null}
      <Button
        type="submit"
        loading={pending}
        loadingText="Cancelling..."
        fullWidth
      >
        Cancel booking manually
      </Button>
    </form>
  );
}

type AdminBookingDetailsProps = {
  booking: BookingDetailsItem;
};

export function AdminBookingDetails({ booking }: AdminBookingDetailsProps) {
  const paymentStatus = booking.payment?.paymentStatus ?? null;
  const clientName = getClientName(booking);
  const therapistName = getTherapistName(booking);
  const canCancel = !["CANCELLED", "AUTO_CANCELLED", "REJECTED", "COMPLETED"].includes(booking.bookingStatus);
  const paymentIncidentSummary = getPaymentIncidentSummary(booking);

  return (
    <div className="grid gap-6">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Admin booking details</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Operational record</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              This page gives admins a full booking snapshot across client, therapist, payment, session state, and manual intervention controls.
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

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <h3 className="text-lg font-semibold text-slate-900">People and session</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Client</dt>
                <dd className="text-right">{clientName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Therapist</dt>
                <dd className="text-right">{therapistName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Starts</dt>
                <dd className="text-right">{formatDateTime(booking.startsAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Ends</dt>
                <dd className="text-right">{formatDateTime(booking.endsAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Meeting link</dt>
                <dd className="text-right">
                  {booking.session?.meetingUrl ? (
                    <a href={booking.session.meetingUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 underline underline-offset-4">Open session link</a>
                  ) : (
                    "Not available yet"
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Integration state</dt>
                <dd className="text-right">
                  {booking.session?.googleCalendarEventId ? "Google Calendar synced" : "No synced event"}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <h3 className="text-lg font-semibold text-slate-900">Payment and cancellation</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Payment status</dt>
                <dd className="text-right">{paymentStatus ? formatPaymentStatus(paymentStatus) : "No payment record"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Paid at</dt>
                <dd className="text-right">{formatDateTime(booking.payment?.paidAt ?? null)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Checkout expires</dt>
                <dd className="text-right">{formatDateTime(booking.payment?.checkoutExpiresAt ?? null)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Cancelled at</dt>
                <dd className="text-right">{formatDateTime(booking.cancelledAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Cancelled by</dt>
                <dd className="text-right">{booking.cancelledBy ? ([booking.cancelledBy.firstName, booking.cancelledBy.lastName].filter(Boolean).join(" ") || booking.cancelledBy.email) : "Not cancelled"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Compensation</dt>
                <dd className="text-right">
                  {booking.compensationResolutionType
                    ? `${booking.compensationResolutionType.toLowerCase()} at ${formatDateTime(booking.compensationResolvedAt ?? null)}`
                    : "Not resolved"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
              {paymentIncidentSummary}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Notes and identifiers</h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">{booking.notes || "No extra notes were attached to this booking record."}</p>
          <div className="mt-5">
            <GoogleCalendarMeetingStatus
              meetingUrl={booking.session?.meetingUrl}
              googleCalendarEventId={booking.session?.googleCalendarEventId}
              googleCalendarEventHtmlLink={booking.session?.googleCalendarEventHtmlLink}
              bookingStatus={booking.bookingStatus}
            />
          </div>
          <dl className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
              <dt className="font-medium text-slate-700">Booking ID</dt>
              <dd className="mt-1">{booking.id}</dd>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
              <dt className="font-medium text-slate-700">Stripe payment intent</dt>
              <dd className="mt-1">{booking.payment?.stripePaymentIntentId ?? "Not available"}</dd>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3 md:col-span-2">
              <dt className="font-medium text-slate-700">Payment incident details</dt>
              <dd className="mt-1">{paymentIncidentSummary}</dd>
            </div>
          </dl>
        </article>

        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Manual intervention</h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Use this control only when operations need to override the normal workflow and cancel the booking directly from the admin panel.
          </p>
          {canCancel ? (
            <ManualCancelForm bookingId={booking.id} />
          ) : (
            <div className="mt-5">
              <DashboardStatusAlert tone="info">
                This booking is already in a final state, so manual cancellation is no longer available.
              </DashboardStatusAlert>
            </div>
          )}
          <div className="mt-5">
            <Link href="/admin/bookings" className="text-sm font-medium text-slate-900 underline underline-offset-4">
              Back to bookings
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
