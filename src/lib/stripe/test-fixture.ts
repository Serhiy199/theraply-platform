import "server-only";
import { getStripeRuntimeMode, StripeIsolationError } from "@/lib/stripe/runtime-mode";

// Immutable pre-LIVE production TEST fixtures. Never authorize LIVE financial work.
export const PRODUCTION_TEST_THERAPIST = {
  userId: "cmsr4h3zf000noykga45ku6za",
  profileId: "cmsr4h3zi000poykgtg1y1s3n",
} as const;
const paymentIds = new Set([
  "cmt5icu4r0031oyaj4154pr5m", "cmt5jqmmv004boyajwil76u9m",
  "cmt5k285r004zoyajo7uc91pw", "cmt5rc59q000hoycw4se0znay",
  "cmt5t98x1000hoy2gr9een7a7",
]);

export type StripeFinancialContext = {
  therapistId?: string | null;
  profileId?: string | null;
  payment?: { id?: string | null; stripeCheckoutSessionId?: string | null } | null;
};

export function isProductionTestFixture(context: StripeFinancialContext) {
  return context.therapistId === PRODUCTION_TEST_THERAPIST.userId ||
    context.profileId === PRODUCTION_TEST_THERAPIST.profileId ||
    Boolean(context.payment?.id && paymentIds.has(context.payment.id));
}

export function assertStripeFinancialContext(context: StripeFinancialContext) {
  const mode = getStripeRuntimeMode();
  const session = context.payment?.stripeCheckoutSessionId;
  if (mode === "LIVE" && (isProductionTestFixture(context) || session?.startsWith("cs_test_"))) {
    throw new StripeIsolationError("TEST_FIXTURE_FORBIDDEN");
  }
  if (mode === "TEST" && session?.startsWith("cs_live_")) {
    throw new StripeIsolationError("STRIPE_MODE_MISMATCH");
  }
}
