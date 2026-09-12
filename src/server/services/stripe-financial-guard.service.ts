import "server-only";
import type { Prisma } from "@prisma/client";
import { assertStripeFinancialContext } from "@/lib/stripe/test-fixture";
import { getStripeRuntimeMode, StripeIsolationError } from "@/lib/stripe/runtime-mode";

export async function assertFinancialReferencesAllowed(
  db: Prisma.TransactionClient,
  input: { bookingId?: string | null; paymentId?: string | null },
) {
  assertStripeFinancialContext({ payment: { id: input.paymentId } });
  if (getStripeRuntimeMode() !== "LIVE") return;
  if (!input.bookingId && !input.paymentId) return;
  const booking = await db.booking.findFirst({
    where: { ...(input.bookingId ? { id: input.bookingId } : {}), ...(input.paymentId ? { payment: { id: input.paymentId } } : {}) },
    select: { therapistId: true, payment: { select: { id: true, stripeCheckoutSessionId: true } } },
  });
  if (!booking) throw new StripeIsolationError("TEST_FIXTURE_FORBIDDEN");
  assertStripeFinancialContext(booking);
}
