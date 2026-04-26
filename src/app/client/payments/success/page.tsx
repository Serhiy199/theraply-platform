import { UserRole } from "@prisma/client";
import { ClientPaymentResult } from "@/components/dashboard/client/client-payment-result";
import { requireRole } from "@/lib/permissions";

type ClientPaymentSuccessPageProps = {
  searchParams: Promise<{
    bookingId?: string;
    session_id?: string;
  }>;
};

export default async function ClientPaymentSuccessPage({
  searchParams,
}: ClientPaymentSuccessPageProps) {
  await requireRole([UserRole.CLIENT]);
  const params = await searchParams;
  const bookingHref = params.bookingId ? `/client/bookings/${params.bookingId}` : null;

  return (
    <ClientPaymentResult
      tone="success"
      meta="Payment success"
      title="Stripe Checkout was completed"
      description="Your payment details were submitted successfully in Stripe Checkout. The platform will now finalize the payment state and reflect it in your booking."
      bookingHref={bookingHref}
      bookingLabel="Open this booking"
      sessionId={params.session_id ?? null}
      extraNote="This page confirms that Stripe Checkout finished successfully. The next implementation step connects Stripe webhooks so the final PAID status is updated server-side without relying on the browser redirect alone."
    />
  );
}
