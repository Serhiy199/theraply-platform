"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { BookingDetailsItem } from "@/lib/contracts/bookings";
import {
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getCancellationPolicyMessage,
  getPaymentStatusBadgeClass,
  isLateCancellation,
} from "@/lib/utils/format-booking";
import {
  cancelBookingAction,
  initialCancelBookingActionState,
  type CancelBookingActionState,
} from "@/app/client/bookings/actions";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";
import { GoogleCalendarMeetingStatus } from "@/components/dashboard/shared/google-calendar-status";

function formatDateTime(date: Date | null) {
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTherapistName(booking: BookingDetailsItem) {
  return (
    booking.therapist.therapistProfile?.displayName ||
    [booking.therapist.firstName, booking.therapist.lastName].filter(Boolean).join(" ") ||
    booking.therapist.email
  );
}

function CancelBookingForm({ booking }: { booking: BookingDetailsItem }) {
  const [state, formAction, pending] = useActionState<CancelBookingActionState, FormData>(
    cancelBookingAction,
    initialCancelBookingActionState,
  );

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <input type="hidden" name="bookingId" value={booking.id} />
      {state.message ? (
        <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </DashboardStatusAlert>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "Cancelling..." : "Cancel booking"}
      </button>
    </form>
  );
}

type ClientBookingDetailsProps = {
  booking: BookingDetailsItem;
};

export function ClientBookingDetails({ booking }: ClientBookingDetailsProps) {
  const paymentStatus = booking.payment?.paymentStatus ?? null;
  const canCancel = ["PENDING_THERAPIST", "CONFIRMED"].includes(booking.bookingStatus) && booking.startsAt > new Date();
  const lateCancellation = isLateCancellation(booking.startsAt);
  const therapistName = getTherapistName(booking);

  return (
    <div className="grid gap-6">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Booking details</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">{therapistName}</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              This page centralizes booking status, therapist details, payment readiness, meeting access, and cancellation guidance.
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
            <h3 className="text-lg font-semibold text-slate-900">Session timing</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
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
                    <a href={booking.session.meetingUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 underline underline-offset-4">
                      Open session link
                    </a>
                  ) : (
                    "Will appear after therapist confirmation"
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Link source</dt>
                <dd className="text-right">
                  {booking.session?.googleCalendarEventId ? "Google Meet via Calendar" : "Pending or manual link"}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <h3 className="text-lg font-semibold text-slate-900">Therapist and payment</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Therapist</dt>
                <dd className="text-right">{therapistName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Specialization</dt>
                <dd className="text-right">{booking.therapist.therapistProfile?.specialization ?? "Not specified yet"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Payment status</dt>
                <dd className="text-right">{paymentStatus ? formatPaymentStatus(paymentStatus) : "No payment record yet"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Paid at</dt>
                <dd className="text-right">{formatDateTime(booking.payment?.paidAt ?? null)}</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Booking notes</h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            {booking.notes || "No extra booking notes were attached to this record yet."}
          </p>

          <GoogleCalendarMeetingStatus
            meetingUrl={booking.session?.meetingUrl}
            googleCalendarEventId={booking.session?.googleCalendarEventId}
            googleCalendarEventHtmlLink={booking.session?.googleCalendarEventHtmlLink}
            bookingStatus={booking.bookingStatus}
          />
        </article>

        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-slate-900">Cancellation policy</h3>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${lateCancellation ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {lateCancellation ? "Less than 24h" : "24h+"}
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-600">{getCancellationPolicyMessage(booking.startsAt)}</p>
          {canCancel ? (
            <CancelBookingForm booking={booking} />
          ) : (
            <div className="mt-5">
              <DashboardStatusAlert tone="info">
                This booking can no longer be cancelled from the client area because its current state is already final or the session time has passed.
              </DashboardStatusAlert>
            </div>
          )}
          <div className="mt-5">
            <Link href="/client/bookings" className="text-sm font-medium text-slate-900 underline underline-offset-4">
              Back to bookings
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
