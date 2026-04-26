import { UserRole } from "@prisma/client";
import { ClientPaymentResult } from "@/components/dashboard/client/client-payment-result";
import { requireRole } from "@/lib/permissions";

type ClientPaymentFailedPageProps = {
  searchParams: Promise<{
    bookingId?: string;
    reason?: string;
  }>;
};

function getDescription(reason: string | undefined) {
  if (reason === "cancelled") {
    return "The Stripe Checkout flow was cancelled before the payment was completed. You can return to the booking and try again when you're ready.";
  }

  return "The payment was not completed. You can review the booking details and start a new Stripe Checkout attempt when the booking is still eligible for payment.";
}

export default async function ClientPaymentFailedPage({
  searchParams,
}: ClientPaymentFailedPageProps) {
  await requireRole([UserRole.CLIENT]);
  const params = await searchParams;
  const bookingHref = params.bookingId ? `/client/bookings/${params.bookingId}` : null;

  return (
    <ClientPaymentResult
      tone="warning"
      meta={params.reason === "cancelled" ? "Checkout cancelled" : "Payment incomplete"}
      title={params.reason === "cancelled" ? "Stripe Checkout was cancelled" : "Payment was not completed"}
      description={getDescription(params.reason)}
      bookingHref={bookingHref}
      bookingLabel="Return to this booking"
      extraNote="The booking itself is not cancelled automatically. If it is still eligible for payment, the client can start Stripe Checkout again from the booking details page."
    />
  );
}
