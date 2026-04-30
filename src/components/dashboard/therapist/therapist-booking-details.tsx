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
  requestDecisionAction,
  therapistCancelSessionAction,
  type RequestDecisionActionState,
  type TherapistCancelSessionActionState,
} from "@/app/therapist/requests/actions";
import { GoogleCalendarMeetingStatus } from "@/components/dashboard/shared/google-calendar-status";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";

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

function getPaymentOutcomeMessage(booking: BookingDetailsItem) {
  if (!booking.payment) {
    return "No payment record has been created yet.";
  }

  if (booking.payment.paymentStatus === "FAILED") {
    return booking.payment.failedReason || "The latest Stripe payment attempt failed.";
  }

  if (booking.payment.paymentStatus === "REFUNDED") {
    return booking.payment.refundReason || "Stripe marked this booking as refunded.";
  }

  if (booking.payment.paymentStatus === "PENDING") {
    return booking.payment.checkoutExpiresAt
      ? `Client checkout is still open until approximately ${formatDateTime(booking.payment.checkoutExpiresAt)}.`
      : "Client checkout has started but has not completed yet.";
  }

  if (booking.payment.paymentStatus === "PAID") {
    return "Stripe confirmed payment for this session.";
  }

  return "No payment incident recorded.";
}

function DecisionForm({ bookingId, intent, label }: { bookingId: string; intent: "confirm" | "reject"; label: string }) {
  const initialRequestDecisionActionState: RequestDecisionActionState = {
    status: "idle",
  };
  const [state, formAction, pending] = useActionState<RequestDecisionActionState, FormData>(
    requestDecisionAction,
    initialRequestDecisionActionState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="intent" value={intent} />
      {state.message ? (
        <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </DashboardStatusAlert>
      ) : null}
      <Button
        type="submit"
        loading={pending}
        loadingText={`${label}...`}
        fullWidth
        variant={intent === "confirm" ? "primary" : "danger"}
      >
        {label}
      </Button>
    </form>
  );
}

function CancelConfirmedSessionForm({ bookingId, hasPaidSession }: { bookingId: string; hasPaidSession: boolean }) {
  const initialTherapistCancelSessionActionState: TherapistCancelSessionActionState = {
    status: "idle",
  };
  const [state, formAction, pending] = useActionState<
    TherapistCancelSessionActionState,
    FormData
  >(therapistCancelSessionAction, initialTherapistCancelSessionActionState);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.message ? (
        <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </DashboardStatusAlert>
      ) : null}
      <DashboardStatusAlert tone={hasPaidSession ? "warning" : "info"}>
        {hasPaidSession
          ? "If you cancel this confirmed and paid session, the client will be able to choose either a full refund or platform credit from their booking page."
          : "Cancelling this confirmed session will remove it from the schedule and stop the booking flow for the client."}
      </DashboardStatusAlert>
      <Button
        type="submit"
        loading={pending}
        loadingText="Cancelling session..."
        fullWidth
      >
        Cancel session
      </Button>
    </form>
  );
}

type TherapistBookingDetailsProps = {
  booking: BookingDetailsItem;
};

export function TherapistBookingDetails({ booking }: TherapistBookingDetailsProps) {
  const paymentStatus = booking.payment?.paymentStatus ?? null;
  const canDecide = booking.bookingStatus === "PENDING_THERAPIST";
  const canCancelConfirmed = booking.bookingStatus === "CONFIRMED" && booking.startsAt > new Date();
  const clientName = getClientName(booking);
  const paymentOutcomeMessage = getPaymentOutcomeMessage(booking);

  return (
    <div className="grid gap-6">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Request details</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">{clientName}</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Review the request, understand the booking context, then confirm or reject the session from one place.
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

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <h3 className="text-lg font-semibold text-slate-900">Session context</h3>
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
                    <a href={booking.session.meetingUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 underline underline-offset-4">Open session link</a>
                  ) : (
                    "Will be ready after scheduling"
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Calendar sync</dt>
                <dd className="text-right">
                  {booking.session?.googleCalendarEventId ? "Google Calendar event" : "Not synced yet"}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <h3 className="text-lg font-semibold text-slate-900">Client and payment</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Client</dt>
                <dd className="text-right">{clientName}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Client email</dt>
                <dd className="text-right">{booking.client.email}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Payment status</dt>
                <dd className="text-right">{paymentStatus ? formatPaymentStatus(paymentStatus) : "No payment record yet"}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Paid at</dt>
                <dd className="text-right">{formatDateTime(booking.payment?.paidAt ?? null)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Checkout expires</dt>
                <dd className="text-right">
                  {formatDateTime(booking.payment?.checkoutExpiresAt ?? null)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
              {paymentOutcomeMessage}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Booking notes</h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">{booking.notes || "No extra booking notes were attached to this request."}</p>
          {booking.session?.meetingUrl || booking.bookingStatus === "CONFIRMED" ? (
            <GoogleCalendarMeetingStatus
              meetingUrl={booking.session?.meetingUrl}
              googleCalendarEventId={booking.session?.googleCalendarEventId}
              googleCalendarEventHtmlLink={booking.session?.googleCalendarEventHtmlLink}
              bookingStatus={booking.bookingStatus}
            />
          ) : (
            <div className="mt-5 rounded-[1.5rem] border border-slate-200/70 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
              Therapist actions taken on this page immediately update the request queue and future session schedule for this client.
            </div>
          )}
        </article>

        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Decision panel</h3>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            {canDecide
              ? "Confirm the request to schedule the session, or reject it if the time or case is not a fit."
              : canCancelConfirmed
                ? "This session is already confirmed. If circumstances change, you can cancel it here and the client will be notified."
                : "This request is already in a final state, so no further therapist action is needed from this page."}
          </p>
          {canDecide ? (
            <div className="mt-5 grid gap-4">
              <DecisionForm bookingId={booking.id} intent="confirm" label="Confirm booking" />
              <DecisionForm bookingId={booking.id} intent="reject" label="Reject booking" />
            </div>
          ) : canCancelConfirmed ? (
            <div className="mt-5">
              <CancelConfirmedSessionForm
                bookingId={booking.id}
                hasPaidSession={paymentStatus === "PAID"}
              />
            </div>
          ) : (
            <div className="mt-5">
              <DashboardStatusAlert tone="info">
                The current booking state is {formatBookingStatus(booking.bookingStatus).toLowerCase()}, so this workflow has already been resolved.
              </DashboardStatusAlert>
            </div>
          )}
          <div className="mt-5">
            <ButtonLink href="/therapist/requests" variant="ghost" size="sm">
              Back to requests
            </ButtonLink>
          </div>
        </article>
      </section>
    </div>
  );
}
