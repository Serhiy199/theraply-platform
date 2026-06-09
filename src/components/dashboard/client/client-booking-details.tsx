"use client";

import { useActionState, useState, useTransition } from "react";
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
import { formatAppDateTime } from "@/lib/utils/date-time";
import {
  cancelBookingAction,
  type CancelBookingActionState,
} from "@/app/client/bookings/actions";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";
import { GoogleCalendarMeetingStatus } from "@/components/dashboard/shared/google-calendar-status";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

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
      ? `Checkout is still open and is expected to expire on ${formatAppDateTime(booking.payment.checkoutExpiresAt)}.`
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
  const therapistName = getTherapistName(booking);
  const paymentOutcomeMessage = getPaymentOutcomeMessage(booking);

  return (
    <div className="grid gap-6">
      <SurfaceCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionEyebrow>Booking details</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">{therapistName}</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              This page centralizes booking status, therapist details, payment readiness, meeting access, and cancellation guidance.
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
          <InsetCard tone="plain">
            <h3 className="text-lg font-semibold text-slate-900">Session timing</h3>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Starts</dt>
                <dd className="text-right">{formatAppDateTime(booking.startsAt)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Ends</dt>
                <dd className="text-right">{formatAppDateTime(booking.endsAt)}</dd>
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
          </InsetCard>

          <InsetCard tone="plain">
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
                <dd className="text-right">{formatAppDateTime(paymentEligibility.paymentDueBy)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Paid at</dt>
                <dd className="text-right">{formatAppDateTime(booking.payment?.paidAt ?? null)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Checkout expires</dt>
                <dd className="text-right">
                  {formatAppDateTime(booking.payment?.checkoutExpiresAt ?? null)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="font-medium text-slate-700">Refunded at</dt>
                <dd className="text-right">
                  {formatAppDateTime(booking.payment?.refundedAt ?? null)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
              {paymentOutcomeMessage}
            </div>
          </InsetCard>
        </div>
      </SurfaceCard>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard as="article" className="p-6">
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
        </SurfaceCard>

        <SurfaceCard as="article" className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">
            Payment readiness
          </h3>
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
                  {formatAppDateTime(booking.compensationResolvedAt ?? null)}.
                </div>
              ) : null}
              <PaymentCheckoutButton
                bookingId={booking.id}
                paymentEligibility={paymentEligibility}
              />
          </>
        </SurfaceCard>

        <SurfaceCard as="article" className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-slate-900">Cancellation policy</h3>
            <Badge variant={lateCancellation ? "danger" : "success"}>
              {lateCancellation ? "Less than 24h" : "24h+"}
            </Badge>
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
            <ButtonLink href="/client/bookings" variant="ghost" size="sm">
              Back to bookings
            </ButtonLink>
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}
