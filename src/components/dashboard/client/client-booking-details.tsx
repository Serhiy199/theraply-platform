"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import type { BookingDetailsItem } from "@/lib/contracts/bookings";
import type { PaymentEligibility } from "@/server/services/payment-flow.service";
import {
  getCancellationConfirmationMessage,
  formatBookingStatus,
  formatPaymentStatus,
  getBookingStatusBadgeClass,
  getCancellationPolicyMessage,
  getPaymentStatusBadgeClass,
  isLateCancellation,
} from "@/lib/utils/format-booking";
import {
  cancelBookingAction,
  resolveCompensationAction,
  type CancelBookingActionState,
  type ResolveCompensationActionState,
} from "@/app/client/bookings/actions";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";
import { GoogleCalendarMeetingStatus } from "@/components/dashboard/shared/google-calendar-status";
import { Button } from "@/components/ui/button";

function formatDateTime(date: Date | null) {
  if (!date) return "Not available";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAmount(amount: number | null, currency = "GBP") {
  if (typeof amount !== "number") return "Not available";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function getTherapistName(booking: BookingDetailsItem) {
  return (
    booking.therapist.therapistProfile?.displayName ||
    [booking.therapist.firstName, booking.therapist.lastName].filter(Boolean).join(" ") ||
    booking.therapist.email
  );
}

function getPaymentOutcomeMessage(booking: BookingDetailsItem) {
  if (!booking.payment) {
    return "No payment record has been created yet.";
  }

  if (booking.payment.paymentStatus === "FAILED") {
    return booking.payment.failedReason || "The latest payment attempt did not complete successfully.";
  }

  if (booking.payment.paymentStatus === "REFUNDED") {
    return booking.payment.refundReason || "A Stripe refund was completed for this booking.";
  }

  if (booking.payment.paymentStatus === "PENDING") {
    return booking.payment.checkoutExpiresAt
      ? `Checkout is still open and is expected to expire on ${formatDateTime(booking.payment.checkoutExpiresAt)}.`
      : "Checkout has been started but has not completed yet.";
  }

  if (booking.payment.paymentStatus === "PAID") {
    return "Stripe confirmed the payment and this session is financially cleared.";
  }

  return "No payment incident has been recorded.";
}

function CancelBookingForm({ booking }: { booking: BookingDetailsItem }) {
  const initialCancelBookingActionState: CancelBookingActionState = {
    status: "idle",
  };
  const [state, formAction, pending] = useActionState<CancelBookingActionState, FormData>(
    cancelBookingAction,
    initialCancelBookingActionState,
  );
  const [lateAcknowledged, setLateAcknowledged] = useState(false);
  const lateCancellation = isLateCancellation(booking.startsAt);
  const hasCapturedPayment = booking.payment?.paymentStatus === "PAID";
  const confirmationMessage = getCancellationConfirmationMessage(
    booking.startsAt,
    hasCapturedPayment,
  );
  const disabled = pending || (lateCancellation && !lateAcknowledged);

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <input type="hidden" name="bookingId" value={booking.id} />
      {state.message ? (
        <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </DashboardStatusAlert>
      ) : null}
      <DashboardStatusAlert
        tone={lateCancellation ? "warning" : "info"}
        title={lateCancellation ? "Late cancellation warning" : "Cancellation confirmation"}
      >
        {confirmationMessage}
      </DashboardStatusAlert>
      {lateCancellation ? (
        <label className="flex items-start gap-3 rounded-[1.25rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-900">
          <input
            type="checkbox"
            checked={lateAcknowledged}
            onChange={(event) => setLateAcknowledged(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-rose-300 text-rose-700 focus:ring-rose-500"
          />
          <span>
            I understand that this cancellation is taking place less than 24 hours before the
            session and any captured payment for the booked time is non-refundable.
          </span>
        </label>
      ) : null}
      <Button
        type="submit"
        disabled={lateCancellation && !lateAcknowledged}
        loading={pending}
        loadingText="Cancelling..."
        fullWidth
      >
        {lateCancellation ? "Confirm late cancellation" : "Cancel booking"}
      </Button>
    </form>
  );
}

function CompensationChoiceForm({ bookingId }: { bookingId: string }) {
  const initialResolveCompensationActionState: ResolveCompensationActionState = {
    status: "idle",
  };
  const [state, formAction, pending] = useActionState<
    ResolveCompensationActionState,
    FormData
  >(resolveCompensationAction, initialResolveCompensationActionState);

  return (
    <form action={formAction} className="mt-5 grid gap-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.message ? (
        <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </DashboardStatusAlert>
      ) : null}
      <DashboardStatusAlert tone="warning" title="Therapist cancelled this paid session">
        Choose whether you want the money returned to your card or kept as platform credit for a future booking.
      </DashboardStatusAlert>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="submit"
          name="resolution"
          value="refund"
          loading={pending}
          loadingText="Processing..."
        >
          Choose refund
        </Button>
        <Button
          type="submit"
          name="resolution"
          value="credit"
          loading={pending}
          loadingText="Processing..."
          variant="success"
        >
          Keep as credit
        </Button>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Refund returns the paid amount through Stripe. Credit keeps the full session value on your Theraply balance for your next booking.
      </p>
    </form>
  );
}

type PaymentCheckoutButtonProps = {
  bookingId: string;
  paymentEligibility: PaymentEligibility;
};

function PaymentCheckoutButton({
  bookingId,
  paymentEligibility,
}: PaymentCheckoutButtonProps) {
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = !paymentEligibility.canPay || isPending;

  function handleCheckout() {
    setCheckoutError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ bookingId }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { checkoutUrl?: string; error?: string }
          | null;

        if (!response.ok) {
          setCheckoutError(
            payload?.error || "Unable to start Stripe Checkout right now.",
          );
          return;
        }

        if (!payload?.checkoutUrl) {
          setCheckoutError("Stripe Checkout did not return a redirect URL.");
          return;
        }

        window.location.assign(payload.checkoutUrl);
      } catch {
        setCheckoutError("Unable to reach Stripe Checkout right now. Please try again.");
      }
    });
  }

  return (
    <div className="mt-5 grid gap-4">
      {checkoutError ? (
        <DashboardStatusAlert tone="error" title="Checkout could not be started">
          {checkoutError}
        </DashboardStatusAlert>
      ) : null}

      <Button
        type="button"
        onClick={handleCheckout}
        disabled={!paymentEligibility.canPay}
        loading={isPending}
        loadingText="Preparing settlement..."
      >
        {paymentEligibility.projectedStripeChargeAmount === 0
          ? "Apply credit and settle"
          : "Pay now"}
      </Button>

      <p className="text-xs leading-5 text-slate-500">
        {paymentEligibility.projectedStripeChargeAmount === 0
          ? "Your available client credit can fully settle this session without leaving the platform."
          : "You will be redirected to secure Stripe Checkout to complete the remaining balance."}
      </p>
    </div>
  );
}

type ClientBookingDetailsProps = {
  booking: BookingDetailsItem;
  paymentEligibility: PaymentEligibility;
};

export function ClientBookingDetails({ booking, paymentEligibility }: ClientBookingDetailsProps) {
  const paymentStatus = booking.payment?.paymentStatus ?? null;
  const canCancel = ["PENDING_THERAPIST", "CONFIRMED"].includes(booking.bookingStatus) && booking.startsAt > new Date();
  const lateCancellation = isLateCancellation(booking.startsAt);
  const compensationChoiceAvailable =
    booking.bookingStatus === "CANCELLED" &&
    booking.cancelledByUserId === booking.therapist.id &&
    paymentStatus === "PAID" &&
    !booking.compensationResolutionType;
  const therapistName = getTherapistName(booking);
  const paymentOutcomeMessage = getPaymentOutcomeMessage(booking);

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
                <dt className="font-medium text-slate-700">Session price</dt>
                <dd className="text-right">
                  {formatAmount(paymentEligibility.amount, paymentEligibility.currency)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Available credit</dt>
                <dd className="text-right">
                  {formatAmount(
                    paymentEligibility.availableCreditAmount,
                    paymentEligibility.currency,
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Credit applied next</dt>
                <dd className="text-right">
                  {formatAmount(
                    paymentEligibility.projectedCreditAppliedAmount,
                    paymentEligibility.currency,
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Remaining card charge</dt>
                <dd className="text-right">
                  {formatAmount(
                    paymentEligibility.projectedStripeChargeAmount,
                    paymentEligibility.currency,
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Payment deadline</dt>
                <dd className="text-right">{formatDateTime(paymentEligibility.paymentDueBy)}</dd>
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
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Refunded at</dt>
                <dd className="text-right">
                  {formatDateTime(booking.payment?.refundedAt ?? null)}
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
          <h3 className="text-xl font-semibold text-slate-900">
            {compensationChoiceAvailable ? "Compensation options" : "Payment readiness"}
          </h3>
          {compensationChoiceAvailable ? (
            <CompensationChoiceForm bookingId={booking.id} />
          ) : (
            <>
              <div className="mt-5">
                <DashboardStatusAlert
                  tone={
                    paymentEligibility.canPay
                      ? "success"
                      : paymentEligibility.code === "PAYMENT_DEADLINE_PASSED"
                        ? "warning"
                        : "info"
                  }
                  title={paymentEligibility.canPay ? "Checkout can be started" : "Checkout is not available yet"}
                >
                  {paymentEligibility.message}
                </DashboardStatusAlert>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Payment rules are enforced on the server side before Stripe Checkout is created, so this button only activates when the booking is genuinely payable.
              </p>
              {booking.compensationResolutionType ? (
                <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
                  Compensation state: {booking.compensationResolutionType.toLowerCase()} resolved on{" "}
                  {formatDateTime(booking.compensationResolvedAt ?? null)}.
                </div>
              ) : null}
              <PaymentCheckoutButton
                bookingId={booking.id}
                paymentEligibility={paymentEligibility}
              />
            </>
          )}
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
