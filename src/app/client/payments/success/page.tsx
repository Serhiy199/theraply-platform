import { UserRole } from "@prisma/client";
import { ClientPaymentResult } from "@/components/dashboard/client/client-payment-result";
import { requireRole } from "@/lib/permissions";

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
  await requireRole([UserRole.CLIENT]);
  const params = await searchParams;
  const bookingHref = params.bookingId ? `/client/bookings/${params.bookingId}` : null;
  const settledFromCredit = params.source === "credit";

  return (
    <ClientPaymentResult
      tone="success"
      meta={settledFromCredit ? "Credit applied" : "Payment success"}
      title={settledFromCredit ? "Session was paid using client credit" : "Stripe Checkout was completed"}
      description={
        settledFromCredit
          ? "Your available client credit covered this confirmed session, so the booking was settled without opening Stripe Checkout."
          : "Your payment details were submitted successfully in Stripe Checkout. The platform will now finalize the payment state and reflect it in your booking."
      }
      bookingHref={bookingHref}
      bookingLabel="Open this booking"
      sessionId={settledFromCredit ? null : (params.session_id ?? null)}
      extraNote={
        settledFromCredit
          ? "The client credit ledger has already been updated and the booking is now marked as paid."
          : "This page confirms that Stripe Checkout finished successfully. Stripe webhooks now finalize the payment state server-side so the booking stays in sync even without relying on the browser redirect alone."
      }
    />
  );
}
