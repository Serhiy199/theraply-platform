import {
  BookingStatus,
  CompensationResolutionType,
  PaymentStatus,
  Prisma,
  StripeConnectOnboardingStatus,
} from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "../src/lib/prisma";
import {
  getAdminPayments,
  adminCancelBooking,
} from "../src/server/services/admin-operations.service";
import {
  getClientBookingById,
  getClientPayments,
  cancelClientBooking,
} from "../src/server/services/client-bookings.service";
import {
  applyClientCreditToPayment,
  getClientCreditSummary,
  issueClientCredit,
} from "../src/server/services/client-credit.service";
import {
  createClientStripeCheckoutSession,
  getClientPaymentEligibility,
  getPaymentDueBy,
} from "../src/server/services/payment-flow.service";
import { processStripeWebhookEventBestEffort } from "../src/server/services/stripe-webhook.service";
import { getAdminDashboardData } from "../src/server/services/dashboard.service";

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function buildStripeEvent<T extends Stripe.Event["type"]>(
  id: string,
  type: T,
  object: Record<string, unknown>,
): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2025-09-30.clover",
    created: Math.floor(Date.now() / 1000),
    data: {
      object,
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type,
  } as unknown as Stripe.Event;
}

async function main() {
  const startedAt = new Date();
  const cleanupBookingIds: string[] = [];
  const cleanupPaymentIds = new Set<string>();
  const cleanupEventIds: string[] = [];

  const client = await prisma.user.findUnique({
    where: { email: "client.emma@theraply.local" },
  });
  const therapist = await prisma.user.findUnique({
    where: { email: "therapist.anna@theraply.local" },
  });
  const admin = await prisma.user.findUnique({
    where: { email: "admin@theraply.local" },
  });

  if (!client || !therapist || !admin) {
    throw new Error("Seed users not found in the current database.");
  }

  const originalCreditBalance = await prisma.clientCreditBalance.findUnique({
    where: { clientId: client.id },
    select: { balance: true, currency: true },
  });
  const originalTherapistProfile = await prisma.therapistProfile.findUnique({
    where: { userId: therapist.id },
    select: {
      sessionPricePence: true,
      stripeAccountId: true,
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingCompletedAt: true,
      stripeAccountSyncedAt: true,
      stripeRequirementsDue: true,
      stripeDisabledReason: true,
    },
  });

  try {
    const now = new Date();

    await prisma.therapistProfile.update({
      where: { userId: therapist.id },
      data: {
        sessionPricePence: originalTherapistProfile?.sessionPricePence ?? 8500,
        stripeAccountId:
          originalTherapistProfile?.stripeAccountId ??
          `acct_verify_phase10_${therapist.id.slice(0, 12)}`,
        stripeOnboardingStatus: StripeConnectOnboardingStatus.READY,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardingCompletedAt:
          originalTherapistProfile?.stripeOnboardingCompletedAt ?? now,
        stripeAccountSyncedAt: now,
        stripeRequirementsDue: Prisma.DbNull,
        stripeDisabledReason: null,
      },
    });

    const fullCreditBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 72),
        endsAt: addHours(now, 73),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 72)),
        notes: "verification-phase-10-full-credit",
      },
    });
    cleanupBookingIds.push(fullCreditBooking.id);

    await issueClientCredit({
      clientId: client.id,
      bookingId: fullCreditBooking.id,
      amount: 8500,
      currency: "gbp",
      notes: "Verification credit issued for the full-credit settlement flow.",
      actorUserId: admin.id,
    });

    const fullCreditEligibility = await getClientPaymentEligibility(
      client.id,
      fullCreditBooking.id,
    );
    const fullCreditCheckout = await createClientStripeCheckoutSession(client.id, {
      bookingId: fullCreditBooking.id,
      successUrl: `https://example.com/client/payments/success?bookingId=${fullCreditBooking.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `https://example.com/client/payments/failed?bookingId=${fullCreditBooking.id}&reason=cancelled`,
    });
    cleanupPaymentIds.add(fullCreditCheckout.paymentId);

    const fullCreditPayment = await prisma.payment.findUnique({
      where: { id: fullCreditCheckout.paymentId },
      select: {
        paymentStatus: true,
        creditAppliedAmount: true,
        stripeCheckoutSessionId: true,
      },
    });

    const failedBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 80),
        endsAt: addHours(now, 81),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 80)),
        notes: "verification-phase-10-failed-payment",
      },
    });
    cleanupBookingIds.push(failedBooking.id);

    const failedPayment = await prisma.payment.create({
      data: {
        bookingId: failedBooking.id,
        amount: 8500,
        currency: "gbp",
        paymentStatus: PaymentStatus.PENDING,
      },
      select: { id: true },
    });
    cleanupPaymentIds.add(failedPayment.id);

    await issueClientCredit({
      clientId: client.id,
      bookingId: failedBooking.id,
      paymentId: failedPayment.id,
      amount: 2000,
      currency: "gbp",
      notes: "Verification credit issued for failed-payment reversal.",
      actorUserId: admin.id,
    });
    await applyClientCreditToPayment({
      clientId: client.id,
      bookingId: failedBooking.id,
      paymentId: failedPayment.id,
      amount: 2000,
      currency: "gbp",
      notes: "Verification credit applied before a simulated Stripe payment failure.",
    });
    await prisma.payment.update({
      where: { id: failedPayment.id },
      data: { creditAppliedAmount: 2000 },
    });

    const failedEventId = `evt_verify_phase10_failed_${failedBooking.id}`;
    cleanupEventIds.push(failedEventId);
    await processStripeWebhookEventBestEffort(
      buildStripeEvent(failedEventId, "payment_intent.payment_failed", {
        id: "pi_verify_failed_phase10",
        object: "payment_intent",
        amount: 6500,
        currency: "gbp",
        metadata: {
          bookingId: failedBooking.id,
        },
        last_payment_error: {
          message: "Verification failure from Stripe test event.",
        },
      }),
    );

    const failedPaymentAfterWebhook = await prisma.payment.findUnique({
      where: { id: failedPayment.id },
      select: {
        paymentStatus: true,
        failedReason: true,
        creditAppliedAmount: true,
      },
    });

    const expiredBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 88),
        endsAt: addHours(now, 89),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 88)),
        notes: "verification-phase-10-expired-checkout",
      },
    });
    cleanupBookingIds.push(expiredBooking.id);

    const expiredPayment = await prisma.payment.create({
      data: {
        bookingId: expiredBooking.id,
        amount: 8500,
        currency: "gbp",
        paymentStatus: PaymentStatus.PENDING,
      },
      select: { id: true },
    });
    cleanupPaymentIds.add(expiredPayment.id);

    await issueClientCredit({
      clientId: client.id,
      bookingId: expiredBooking.id,
      paymentId: expiredPayment.id,
      amount: 1500,
      currency: "gbp",
      notes: "Verification credit issued for expired-checkout reversal.",
      actorUserId: admin.id,
    });
    await applyClientCreditToPayment({
      clientId: client.id,
      bookingId: expiredBooking.id,
      paymentId: expiredPayment.id,
      amount: 1500,
      currency: "gbp",
      notes: "Verification credit applied before a simulated checkout expiry.",
    });
    await prisma.payment.update({
      where: { id: expiredPayment.id },
      data: { creditAppliedAmount: 1500 },
    });

    const expiredEventId = `evt_verify_phase10_expired_${expiredBooking.id}`;
    cleanupEventIds.push(expiredEventId);
    await processStripeWebhookEventBestEffort(
      buildStripeEvent(expiredEventId, "checkout.session.expired", {
        id: "cs_verify_expired_phase10",
        object: "checkout.session",
        amount_total: 7000,
        currency: "gbp",
        client_reference_id: expiredBooking.id,
        metadata: {
          bookingId: expiredBooking.id,
        },
        expires_at: Math.floor(addHours(now, 1).getTime() / 1000),
      }),
    );

    const expiredPaymentAfterWebhook = await prisma.payment.findUnique({
      where: { id: expiredPayment.id },
      select: {
        paymentStatus: true,
        failedReason: true,
        creditAppliedAmount: true,
      },
    });

    const completedBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 96),
        endsAt: addHours(now, 97),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 96)),
        notes: "verification-phase-10-checkout-complete",
      },
    });
    cleanupBookingIds.push(completedBooking.id);

    const completedPayment = await prisma.payment.create({
      data: {
        bookingId: completedBooking.id,
        amount: 8500,
        currency: "gbp",
        paymentStatus: PaymentStatus.PENDING,
      },
      select: { id: true },
    });
    cleanupPaymentIds.add(completedPayment.id);

    const completedEventId = `evt_verify_phase10_completed_${completedBooking.id}`;
    cleanupEventIds.push(completedEventId);
    await processStripeWebhookEventBestEffort(
      buildStripeEvent(completedEventId, "checkout.session.completed", {
        id: "cs_verify_completed_phase10",
        object: "checkout.session",
        amount_total: 8500,
        currency: "gbp",
        client_reference_id: completedBooking.id,
        metadata: {
          bookingId: completedBooking.id,
        },
        payment_intent: "pi_verify_completed_phase10",
      }),
    );

    const completedPaymentAfterWebhook = await prisma.payment.findUnique({
      where: { id: completedPayment.id },
      select: {
        paymentStatus: true,
        stripePaymentIntentId: true,
      },
    });

    const refundedBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 104),
        endsAt: addHours(now, 105),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 104)),
        notes: "verification-phase-10-refund-webhook",
      },
    });
    cleanupBookingIds.push(refundedBooking.id);

    const refundedPayment = await prisma.payment.create({
      data: {
        bookingId: refundedBooking.id,
        amount: 8500,
        currency: "gbp",
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date(),
        stripePaymentIntentId: "pi_verify_refunded_phase10",
        creditAppliedAmount: 1500,
      },
      select: { id: true },
    });
    cleanupPaymentIds.add(refundedPayment.id);

    const refundedEventId = `evt_verify_phase10_refunded_${refundedBooking.id}`;
    cleanupEventIds.push(refundedEventId);
    await processStripeWebhookEventBestEffort(
      buildStripeEvent(refundedEventId, "charge.refunded", {
        id: "ch_verify_refunded_phase10",
        object: "charge",
        amount: 7000,
        amount_refunded: 7000,
        metadata: {
          bookingId: refundedBooking.id,
        },
        refunds: {
          data: [
            {
              id: "re_verify_phase10",
              reason: "requested_by_customer",
            },
          ],
        },
      }),
    );

    const refundedPaymentAfterWebhook = await prisma.payment.findUnique({
      where: { id: refundedPayment.id },
      select: {
        paymentStatus: true,
        stripeRefundId: true,
        refundedAmount: true,
      },
    });
    const refundedBookingAfterWebhook = await prisma.booking.findUnique({
      where: { id: refundedBooking.id },
      select: {
        compensationResolutionType: true,
        compensationResolvedAt: true,
      },
    });

    const lateCancellationBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 8),
        endsAt: addHours(now, 9),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 8)),
        notes: "verification-phase-10-late-cancellation",
        payment: {
          create: {
            amount: 8500,
            currency: "gbp",
            paymentStatus: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        },
      },
      select: {
        id: true,
        payment: {
          select: {
            id: true,
          },
        },
      },
    });
    cleanupBookingIds.push(lateCancellationBooking.id);
    if (lateCancellationBooking.payment?.id) {
      cleanupPaymentIds.add(lateCancellationBooking.payment.id);
    }

    const lateCancellationResult = await cancelClientBooking(
      client.id,
      lateCancellationBooking.id,
    );

    const pendingAdminVisibilityBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 112),
        endsAt: addHours(now, 113),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 112)),
        notes: "verification-phase-10-admin-pending-visibility",
        payment: {
          create: {
            amount: 8500,
            currency: "gbp",
            paymentStatus: PaymentStatus.PENDING,
            checkoutExpiresAt: addHours(now, 20),
          },
        },
      },
      select: {
        id: true,
        payment: {
          select: {
            id: true,
          },
        },
      },
    });
    cleanupBookingIds.push(pendingAdminVisibilityBooking.id);
    if (pendingAdminVisibilityBooking.payment?.id) {
      cleanupPaymentIds.add(pendingAdminVisibilityBooking.payment.id);
    }

    const adminCancelledBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: addHours(now, 120),
        endsAt: addHours(now, 121),
        bookingStatus: BookingStatus.CONFIRMED,
        paymentDueBy: getPaymentDueBy(addHours(now, 120)),
        notes: "verification-phase-10-admin-cancel",
        payment: {
          create: {
            amount: 8500,
            currency: "gbp",
            paymentStatus: PaymentStatus.FAILED,
            failedAt: new Date(),
            failedReason: "Verification admin cancellation setup.",
          },
        },
      },
      select: {
        id: true,
        payment: {
          select: {
            id: true,
          },
        },
      },
    });
    cleanupBookingIds.push(adminCancelledBooking.id);
    if (adminCancelledBooking.payment?.id) {
      cleanupPaymentIds.add(adminCancelledBooking.payment.id);
    }

    const adminCancellationResult = await adminCancelBooking(
      admin.id,
      adminCancelledBooking.id,
    );

    const clientPayments = await getClientPayments(client.id);
    const clientCreditSummary = await getClientCreditSummary(client.id);
    const adminPayments = await getAdminPayments();
    const adminDashboard = await getAdminDashboardData();
    const fullCreditBookingDetail = await getClientBookingById(
      client.id,
      fullCreditBooking.id,
    );

    const financeCaseMap = Object.fromEntries(
      adminDashboard.financeCases.map((entry) => [entry.label, entry.value]),
    );

    const summary = {
      buildVerified: true,
      automatedVerification: {
        fullCreditSettlement:
          fullCreditEligibility.canPay &&
          fullCreditEligibility.projectedStripeChargeAmount === 0 &&
          fullCreditCheckout.completedFromCredit &&
          fullCreditPayment?.paymentStatus === PaymentStatus.PAID &&
          fullCreditPayment.creditAppliedAmount === 8500 &&
          fullCreditPayment.stripeCheckoutSessionId === null,
        failedPaymentReversesCredit:
          failedPaymentAfterWebhook?.paymentStatus === PaymentStatus.FAILED &&
          failedPaymentAfterWebhook.creditAppliedAmount === null &&
          failedPaymentAfterWebhook.failedReason ===
            "Verification failure from Stripe test event.",
        expiredCheckoutReversesCredit:
          expiredPaymentAfterWebhook?.paymentStatus === PaymentStatus.FAILED &&
          expiredPaymentAfterWebhook.creditAppliedAmount === null &&
          expiredPaymentAfterWebhook.failedReason ===
            "Stripe Checkout session expired before payment completion.",
        checkoutCompletedViaWebhook:
          completedPaymentAfterWebhook?.paymentStatus === PaymentStatus.PAID &&
          completedPaymentAfterWebhook.stripePaymentIntentId ===
            "pi_verify_completed_phase10",
        refundedWebhookSyncsBookingState:
          refundedPaymentAfterWebhook?.paymentStatus === PaymentStatus.REFUNDED &&
          refundedPaymentAfterWebhook.stripeRefundId === "re_verify_phase10" &&
          refundedBookingAfterWebhook?.compensationResolutionType ===
            CompensationResolutionType.REFUND &&
          Boolean(refundedBookingAfterWebhook.compensationResolvedAt),
        lateCancellationPolicyApplied:
          lateCancellationResult.booking.bookingStatus === BookingStatus.CANCELLED &&
          lateCancellationResult.refund.status === "skipped" &&
          lateCancellationResult.refund.reason === "LATE_CANCELLATION_POLICY",
        adminCancelFlowVisible:
          adminCancellationResult.booking.bookingStatus === BookingStatus.CANCELLED &&
          adminCancellationResult.refund.status === "skipped" &&
          adminCancellationResult.refund.reason === "PAYMENT_NOT_PAID",
        clientPaymentsVisible:
          clientPayments.some((entry) => entry.booking.id === fullCreditBooking.id) &&
          clientPayments.some((entry) => entry.booking.id === refundedBooking.id),
        clientCreditVisible:
          clientCreditSummary.recentTransactions.some(
            (entry) =>
              entry.bookingId === fullCreditBooking.id ||
              entry.bookingId === failedBooking.id ||
              entry.bookingId === refundedBooking.id,
          ),
        adminFinanceVisibility:
          (financeCaseMap["Pending checkout"] ?? 0) > 0 &&
          (financeCaseMap["Failed payments"] ?? 0) > 0 &&
          (financeCaseMap["Refunded payments"] ?? 0) > 0 &&
          (financeCaseMap["Credit-backed payments"] ?? 0) > 0,
        adminPaymentsVisible:
          adminPayments.some((entry) => entry.booking.id === refundedBooking.id) &&
          adminPayments.some((entry) => entry.booking.id === failedBooking.id),
        bookingDetailsShowPaymentContext:
          fullCreditBookingDetail?.payment?.paymentStatus === PaymentStatus.PAID &&
          fullCreditBookingDetail.payment?.creditAppliedAmount === 8500,
      },
      financeCases: financeCaseMap,
      limitations: {
        externalStripeCheckoutRedirectVerifiedInScript: false,
        liveStripeRefundRequestVerifiedInScript: false,
        requiredHostedFollowUp: [
          "Run Stripe Checkout in test mode from the hosted app.",
          "Confirm webhook delivery from Stripe Dashboard to /api/stripe/webhook.",
          "Trigger a real test refund against a Stripe test payment intent.",
        ],
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: cleanupBookingIds } },
          { entityId: { in: Array.from(cleanupPaymentIds) } },
          { entityId: { in: cleanupEventIds } },
          {
            entityType: "ClientCreditBalance",
            entityId: client.id,
            createdAt: {
              gte: startedAt,
            },
          },
        ],
      },
    });

    await prisma.clientCreditTransaction.deleteMany({
      where: {
        OR: [
          { bookingId: { in: cleanupBookingIds } },
          { paymentId: { in: Array.from(cleanupPaymentIds) } },
        ],
      },
    });

    if (originalCreditBalance) {
      await prisma.clientCreditBalance.update({
        where: { clientId: client.id },
        data: {
          balance: originalCreditBalance.balance,
          currency: originalCreditBalance.currency,
        },
      });
    }

    if (originalTherapistProfile) {
      await prisma.therapistProfile.update({
        where: { userId: therapist.id },
        data: {
          sessionPricePence: originalTherapistProfile.sessionPricePence,
          stripeAccountId: originalTherapistProfile.stripeAccountId,
          stripeOnboardingStatus: originalTherapistProfile.stripeOnboardingStatus,
          stripeChargesEnabled: originalTherapistProfile.stripeChargesEnabled,
          stripePayoutsEnabled: originalTherapistProfile.stripePayoutsEnabled,
          stripeDetailsSubmitted: originalTherapistProfile.stripeDetailsSubmitted,
          stripeOnboardingCompletedAt: originalTherapistProfile.stripeOnboardingCompletedAt,
          stripeAccountSyncedAt: originalTherapistProfile.stripeAccountSyncedAt,
          stripeRequirementsDue:
            originalTherapistProfile.stripeRequirementsDue === null
              ? Prisma.DbNull
              : (originalTherapistProfile.stripeRequirementsDue as Prisma.InputJsonValue),
          stripeDisabledReason: originalTherapistProfile.stripeDisabledReason,
        },
      });
    }

    if (cleanupPaymentIds.size) {
      await prisma.payment.deleteMany({
        where: {
          OR: [
            { id: { in: Array.from(cleanupPaymentIds) } },
            { bookingId: { in: cleanupBookingIds } },
          ],
        },
      });
    }

    await prisma.session.deleteMany({
      where: {
        bookingId: { in: cleanupBookingIds },
      },
    });

    await prisma.booking.deleteMany({
      where: {
        id: { in: cleanupBookingIds },
      },
    });

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
