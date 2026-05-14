import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import { StripeConfigError } from "@/lib/stripe/stripe-config";
import { paymentCheckoutRequestSchema } from "@/lib/validations/payments";
import {
  createClientStripeCheckoutSession,
  PaymentFlowServiceError,
} from "@/server/services/payment-flow.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";

export const runtime = "nodejs";

function buildSuccessUrl(request: NextRequest, bookingId: string) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const encodedBookingId = encodeURIComponent(bookingId);

  // Keep Stripe's template token raw so Checkout can replace it with a real session id.
  return `${origin}/client/payments/success?bookingId=${encodedBookingId}&session_id={CHECKOUT_SESSION_ID}`;
}

function buildCancelUrl(request: NextRequest, bookingId: string) {
  const url = new URL("/client/payments/failed", request.url);
  url.searchParams.set("bookingId", bookingId);
  url.searchParams.set("reason", "cancelled");
  return url.toString();
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let user: Awaited<ReturnType<typeof requireCurrentActionRole>>;

  try {
    user = await requireCurrentActionRole(
      currentUser,
      [UserRole.CLIENT],
      "Only client accounts can start a Stripe Checkout session.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.stripeCheckout,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = paymentCheckoutRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Booking identifier is missing or invalid.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const checkoutSession = await createClientStripeCheckoutSession(user.id, {
      bookingId: parsed.data.bookingId,
      successUrl: buildSuccessUrl(request, parsed.data.bookingId),
      cancelUrl: buildCancelUrl(request, parsed.data.bookingId),
    });

    return NextResponse.json(
      {
        checkoutUrl: checkoutSession.checkoutUrl,
        sessionId: checkoutSession.sessionId,
        paymentId: checkoutSession.paymentId,
        amount: checkoutSession.amount,
        chargeAmount: checkoutSession.chargeAmount,
        creditAppliedAmount: checkoutSession.creditAppliedAmount,
        currency: checkoutSession.currency,
        expiresAt: checkoutSession.expiresAt?.toISOString() ?? null,
        completedFromCredit: checkoutSession.completedFromCredit,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof PaymentFlowServiceError) {
      const status =
        error.code === "BOOKING_NOT_FOUND"
          ? 404
          : error.code === "STRIPE_NOT_CONFIGURED"
            ? 503
            : error.code === "CHECKOUT_SESSION_CREATE_FAILED"
              ? 502
              : 409;

      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }

    return NextResponse.json(
      { error: "Something went wrong while starting Stripe Checkout." },
      { status: 500 },
    );
  }
}
