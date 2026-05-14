import { UserRole } from "@prisma/client";
import { ClientPaymentResult } from "@/components/dashboard/client/client-payment-result";
import { requireRole } from "@/lib/permissions";
import { getClientBookingById } from "@/server/services/client-bookings.service";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  PaymentFlowServiceError,
  syncClientStripeCheckoutSuccess,
} from "@/server/services/payment-flow.service";

type ClientPaymentSuccessPageProps = {
  searchParams: Promise<{
    bookingId?: string;
    session_id?: string;
    source?: string;
  }>;
};

export default async function ClientPaymentSuccessPage({
  searchParams,
}: ClientPaymentSuccessPageProps) {
  const user = await requireRole([UserRole.CLIENT]);
  const params = await searchParams;
  const bookingHref = params.bookingId ? `/client/bookings/${params.bookingId}` : null;
  const settledFromCredit = params.source === "credit";

  if (params.bookingId && params.session_id && !settledFromCredit) {
    try {
      await syncClientStripeCheckoutSuccess(user.id, params.bookingId, params.session_id);
    } catch (error) {
      // Keep the success page usable even if Stripe redirect data is malformed.
      if (!(error instanceof PaymentFlowServiceError)) {
        logDiagnosticEvent("client-payment-success-page", "Unable to reconcile checkout session.", {
          bookingId: params.bookingId,
          sessionId: params.session_id,
          error,
        });
      }
    }
  }

  const booking =
    params.bookingId ? await getClientBookingById(user.id, params.bookingId) : null;
  const paymentStatus = booking?.payment?.paymentStatus ?? null;
  const paid = paymentStatus === "PAID";

  return (
    <ClientPaymentResult
      tone={settledFromCredit || paid ? "success" : "warning"}
      meta={
        settledFromCredit
          ? "Credit applied"
          : paid
            ? "Payment confirmed"
            : "Payment submitted"
      }
      title={
        settledFromCredit
          ? "Session was paid using client credit"
          : paid
            ? "Payment completed successfully"
            : "Stripe Checkout was completed"
      }
      description={
        settledFromCredit
          ? "Your available client credit covered this confirmed session, so the booking was settled without opening Stripe Checkout."
          : paid
            ? "Stripe confirmed the payment and this booking is now marked as paid in Theraply."
            : "Your payment details were submitted successfully in Stripe Checkout. The platform is still waiting for final server-side confirmation before the booking switches to paid."
      }
      bookingHref={bookingHref}
      bookingLabel="Open this booking"
      sessionId={settledFromCredit ? null : (params.session_id ?? null)}
      extraNote={
        settledFromCredit
          ? "The client credit ledger has already been updated and the booking is now marked as paid."
          : paid
            ? "You should now see the paid state in both the booking details page and the client payments history."
            : "This page confirms that Stripe Checkout finished successfully, but the final paid state has not been written yet. If you are testing locally, make sure Stripe webhooks are being forwarded with stripe listen."
      }
    />
  );
}
