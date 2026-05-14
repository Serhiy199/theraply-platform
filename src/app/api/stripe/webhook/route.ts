import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe/stripe";
import { getStripeConfig, StripeConfigError } from "@/lib/stripe/stripe-config";
import { SAFE_ERROR_MESSAGES, getSafePaymentFlowErrorMessage } from "@/lib/errors/safe-error-messages";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import { processStripeWebhookEventBestEffort, StripeWebhookServiceError } from "@/server/services/stripe-webhook.service";

export const runtime = "nodejs";

function getStripeSignatureHeader(request: NextRequest) {
  return request.headers.get("stripe-signature");
}

export async function POST(request: NextRequest) {
  let payload = "";

  try {
    payload = await request.text();
    const signature = getStripeSignatureHeader(request);

    if (!signature) {
      return NextResponse.json(
        { error: "Missing Stripe-Signature header." },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const config = getStripeConfig();
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      config.webhookSecret,
    ) as Stripe.Event;

    await processStripeWebhookEventBestEffort(event);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return NextResponse.json({ error: getSafePaymentFlowErrorMessage("STRIPE_NOT_CONFIGURED") }, { status: 503 });
    }

    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      await createAuditLogEntryBestEffort({
        entityType: "StripeWebhook",
        entityId: "signature-verification",
        action: "STRIPE_WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
        after: {
          error: error.message,
        },
      });
      logDiagnosticEvent("stripe-webhook-route", "Stripe webhook signature verification failed.", {
        error: error.message,
      });

      return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
    }

    if (error instanceof StripeWebhookServiceError) {
      const status =
        error.code === "PAYMENT_NOT_FOUND"
          ? 404
          : error.code === "BOOKING_REFERENCE_MISSING"
            ? 400
            : 200;

      return NextResponse.json(
        {
          received: true,
          message: SAFE_ERROR_MESSAGES.genericWebhook,
        },
        { status },
      );
    }

    await createAuditLogEntryBestEffort({
      entityType: "StripeWebhook",
      entityId: "route-failure",
      action: "STRIPE_WEBHOOK_ROUTE_FAILED",
      after: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logDiagnosticEvent("stripe-webhook-route", "Unhandled Stripe webhook route failure.", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Something went wrong while handling the Stripe webhook." },
      { status: 500 },
    );
  }
}
