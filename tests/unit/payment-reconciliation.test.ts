import { BookingStatus, PaymentStatus, PaymentTransferStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { processStripeWebhookEvent } from "@/server/services/stripe-webhook.service";
import { enableWebhookFirstStagingGuard, WEBHOOK_FIRST_BOOKING_ID } from "../helpers/webhook-first-staging";
import {
  markStripeCheckoutSessionCompleted,
  markStripePaymentIntentSucceeded,
  PaymentFlowServiceError,
  syncClientStripeCheckoutSuccess,
} from "@/server/services/payment-flow.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const findClientBookingMock = vi.hoisted(() => vi.fn());
const updatePaymentMock = vi.hoisted(() => vi.fn());
const updateBookingMock = vi.hoisted(() => vi.fn());
const successEmailMock = vi.hoisted(() => vi.fn());
const retrieveCheckoutSessionMock = vi.hoisted(() => vi.fn());
const reserveEventMock = vi.hoisted(() => vi.fn());
const releaseEventMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findFirst: findClientBookingMock,
      findUnique: findBookingMock,
      update: updateBookingMock,
    },
    payment: {
      update: updatePaymentMock,
    },
    stripeWebhookEvent: { create: reserveEventMock, delete: releaseEventMock },
  },
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: auditMock,
  logDiagnosticEvent: vi.fn(),
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendPaymentSuccessfulEmailBestEffort: successEmailMock,
  sendPaymentFailedEmailBestEffort: vi.fn(),
}));

vi.mock("@/lib/stripe/stripe-config", () => ({
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        retrieve: retrieveCheckoutSessionMock,
      },
    },
  }),
}));

vi.mock("@/server/services/client-credit.service", () => ({
  acquireFinancialTransactionLock: vi.fn(),
  applyClientCreditToPaymentInTransaction: vi.fn(),
  issueClientCreditInTransaction: vi.fn(),
  reverseClientCreditApplication: vi.fn(),
}));

let payment: Record<string, unknown>;
let deliveredEmailBookings: Set<string>;

function resetPayment() {
  payment = {
    id: "payment-id",
    amount: 10000,
    currency: "gbp",
    paymentStatus: PaymentStatus.PENDING,
    paidAt: null,
    creditAppliedAmount: 2500,
    promoCodeSnapshot: null,
    promoDiscountPercent: null,
    promoDiscountAmount: null,
    clientPayableAmount: null,
    stripeChargeAmount: null,
    stripeCheckoutSessionId: null,
    stripeChargeId: null,
    stripeRefundId: null,
    stripeTransferGroup: "theraply_booking_booking-id",
    platformFeeAmount: 1000,
    therapistAmount: 9000,
    transferStatus: PaymentTransferStatus.NOT_ELIGIBLE,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", "");
  releaseEventMock.mockResolvedValue({});
  resetPayment();
  deliveredEmailBookings = new Set();
  findBookingMock.mockImplementation(async () => ({
    id: "booking-id",
    clientId: "client-id",
    bookingStatus: BookingStatus.CONFIRMED,
    paymentDueBy: new Date("2026-09-01T09:00:00Z"),
    startsAt: new Date("2026-09-02T09:00:00Z"),
    compensationResolutionType: null,
    compensationResolvedAt: null,
    payment,
  }));
  updatePaymentMock.mockImplementation(async ({ data }) => {
    payment = { ...payment, ...data };
    return {
      id: "payment-id",
      bookingId: "booking-id",
      paymentStatus: payment.paymentStatus,
    };
  });
  updateBookingMock.mockResolvedValue({});
  successEmailMock.mockImplementation(async (bookingId: string) => {
    deliveredEmailBookings.add(bookingId);
  });
  retrieveCheckoutSessionMock.mockResolvedValue({
    id: "cs_123",
    client_reference_id: "booking-id",
    metadata: { bookingId: "booking-id" },
    status: "complete",
    payment_status: "paid",
    payment_intent: {
      id: "pi_123",
      latest_charge: "ch_123",
    },
    amount_total: 7500,
    currency: "gbp",
  });
});

afterEach(() => vi.unstubAllEnvs());

const checkoutSuccess = {
  checkoutSessionId: "cs_123",
  paymentIntentId: "pi_123",
  chargeId: "ch_123",
  amount: 7500,
  currency: "gbp",
};

const intentSuccess = {
  paymentIntentId: "pi_123",
  chargeId: "ch_123",
  amount: 7500,
  currency: "gbp",
};

describe("payment snapshot reconciliation", () => {
  it("converges across duplicate success events without adding the booking fee again", async () => {
    Object.assign(payment, { amount: 8000, bookingFeeAmount: 199, creditAppliedAmount: 8000,
      clientPayableAmount: 8000, stripeChargeAmount: 199, promoDiscountAmount: 0,
      therapistAmount: 7200, platformFeeAmount: 800 });
    await markStripeCheckoutSessionCompleted("booking-id", { ...checkoutSuccess, amount: 199, metadata: { bookingFeeAmount: "199" } });
    await markStripePaymentIntentSucceeded("booking-id", { ...intentSuccess, amount: 199, metadata: { bookingFeeAmount: "199" } });
    expect(payment).toMatchObject({ bookingFeeAmount: 199, stripeChargeAmount: 199, creditAppliedAmount: 8000,
      therapistAmount: 7200, platformFeeAmount: 800, paymentStatus: PaymentStatus.PAID });
    expect(deliveredEmailBookings.size).toBe(1);
  });

  it("converges when success return is processed before the webhook", async () => {
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);

    expect(payment).toEqual(
      expect.objectContaining({
        amount: 10000,
        creditAppliedAmount: 2500,
        therapistAmount: 9000,
        platformFeeAmount: 1000,
        paymentStatus: PaymentStatus.PAID,
      }),
    );
    expect(successEmailMock).toHaveBeenCalledTimes(2);
    expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
  });

  it("converges when the webhook is processed before the success return", async () => {
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);

    expect(payment).toEqual(
      expect.objectContaining({
        amount: 10000,
        creditAppliedAmount: 2500,
        therapistAmount: 9000,
        paymentStatus: PaymentStatus.PAID,
      }),
    );
    expect(successEmailMock).toHaveBeenCalledTimes(2);
    expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
  });

  it("routes duplicate completion attempts through the durable email guard", async () => {
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);

    expect(successEmailMock).toHaveBeenCalledTimes(3);
    expect(successEmailMock).toHaveBeenNthCalledWith(1, "booking-id");
    expect(successEmailMock).toHaveBeenNthCalledWith(2, "booking-id");
    expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
  });

  it("keeps duplicate payment-intent events at one durable email intent", async () => {
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);

    expect(payment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
  });

  it("keeps mixed duplicate events at one durable email intent", async () => {
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);

    expect(payment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
  });

  it("converges a success return before the payment-intent webhook", async () => {
    findClientBookingMock.mockResolvedValue({
      id: "booking-id",
      payment: {
        id: "payment-id",
        paymentStatus: PaymentStatus.PENDING,
      },
    });

    await syncClientStripeCheckoutSuccess("client-id", "booking-id", "cs_123");
    await markStripePaymentIntentSucceeded("booking-id", intentSuccess);

    expect(payment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
  });

  it.each(["payment-intent", "checkout"])(
    "converges a success return after the %s webhook",
    async (firstPath) => {
      if (firstPath === "payment-intent") {
        await markStripePaymentIntentSucceeded("booking-id", intentSuccess);
      } else {
        await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
      }

      findClientBookingMock.mockResolvedValue({
        id: "booking-id",
        payment: {
          id: "payment-id",
          paymentStatus: PaymentStatus.PAID,
        },
      });

      await syncClientStripeCheckoutSuccess("client-id", "booking-id", "cs_123");

      expect(deliveredEmailBookings).toEqual(new Set(["booking-id"]));
    },
  );

  it("ensures email delivery when the success return sees an already-paid Payment", async () => {
    findClientBookingMock.mockResolvedValue({
      id: "booking-id",
      payment: {
        id: "payment-id",
        paymentStatus: PaymentStatus.PAID,
      },
    });

    const result = await syncClientStripeCheckoutSuccess(
      "client-id",
      "booking-id",
      "cs_123",
    );

    expect(result.status).toBe("paid");
    expect(successEmailMock).toHaveBeenCalledWith("booking-id");
  });

  it("rejects a Stripe amount that differs from the Payment snapshot", async () => {
    await expect(
      markStripeCheckoutSessionCompleted("booking-id", {
        ...checkoutSuccess,
        amount: 7501,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_SNAPSHOT_MISMATCH",
    } satisfies Partial<PaymentFlowServiceError>);
    expect(updatePaymentMock).not.toHaveBeenCalled();
  });

  it("does not reconstruct a missing Payment from Stripe values", async () => {
    findBookingMock.mockResolvedValueOnce({
      id: "booking-id",
      clientId: "client-id",
      bookingStatus: BookingStatus.CONFIRMED,
      payment: null,
    });

    await expect(
      markStripePaymentIntentSucceeded("booking-id", intentSuccess),
    ).rejects.toMatchObject({
      code: "PAYMENT_RECORD_NOT_FOUND",
    } satisfies Partial<PaymentFlowServiceError>);
  });

  it("reconciles a frozen promo snapshot without reading the current PromoCode", async () => {
    payment = {
      ...payment,
      promoCodeSnapshot: "SAVE5",
      promoDiscountPercent: 5,
      promoDiscountAmount: 500,
      clientPayableAmount: 9500,
      stripeChargeAmount: 7000,
      platformFeeAmount: 500,
    };

    await markStripePaymentIntentSucceeded("booking-id", {
      ...intentSuccess,
      amount: 7000,
      metadata: {
        paymentId: "payment-id",
        promoCode: "SAVE5",
        promoDiscountPercent: "5",
        promoDiscountAmount: "500",
        clientPayableAmount: "9500",
        creditAppliedAmount: "2500",
        stripeChargeAmount: "7000",
      },
    });

    expect(payment).toEqual(
      expect.objectContaining({
        paymentStatus: PaymentStatus.PAID,
        promoCodeSnapshot: "SAVE5",
        promoDiscountAmount: 500,
        stripeChargeAmount: 7000,
      }),
    );
  });

  it("fails closed when Stripe promo metadata conflicts with the snapshot", async () => {
    payment = {
      ...payment,
      promoCodeSnapshot: "SAVE5",
      promoDiscountPercent: 5,
      promoDiscountAmount: 500,
      clientPayableAmount: 9500,
      stripeChargeAmount: 7000,
      platformFeeAmount: 500,
    };

    await expect(
      markStripePaymentIntentSucceeded("booking-id", {
        ...intentSuccess,
        amount: 7000,
        metadata: { promoDiscountAmount: "501" },
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_SNAPSHOT_MISMATCH" });
    expect(updatePaymentMock).not.toHaveBeenCalled();
  });
});

describe("webhook-first success-return isolation", () => {
  function prepareSelectedBooking() {
    enableWebhookFirstStagingGuard();
    Object.assign(payment, {
      amount: 100, bookingFeeAmount: 199, creditAppliedAmount: 0,
      promoDiscountAmount: 0,
      clientPayableAmount: 100, stripeChargeAmount: 299,
      platformFeeAmount: 10, therapistAmount: 90,
      stripeCheckoutSessionId: "cs_test_webhook_first",
    });
    const booking = () => ({
      id: WEBHOOK_FIRST_BOOKING_ID, clientId: "client-id",
      bookingStatus: BookingStatus.CONFIRMED, payment,
    });
    findClientBookingMock.mockResolvedValue(booking());
    findBookingMock.mockImplementation(async () => booking());
    updatePaymentMock.mockImplementation(async ({ data }) => {
      payment = { ...payment, ...data };
      return { id: "payment-id", bookingId: WEBHOOK_FIRST_BOOKING_ID, paymentStatus: payment.paymentStatus };
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  }

  it("leaves the selected owned Payment pending without Stripe reads, emails or writes", async () => {
    prepareSelectedBooking();
    const before = { ...payment };
    const result = await syncClientStripeCheckoutSuccess("client-id", WEBHOOK_FIRST_BOOKING_ID, "cs_test_webhook_first");
    expect(result).toEqual({ status: "pending", bookingId: WEBHOOK_FIRST_BOOKING_ID, reason: "WEBHOOK_FIRST_TEST" });
    expect(findClientBookingMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: WEBHOOK_FIRST_BOOKING_ID, clientId: "client-id" },
    }));
    expect(payment).toEqual(before);
    for (const mock of [retrieveCheckoutSessionMock, updatePaymentMock, updateBookingMock, successEmailMock, auditMock]) {
      expect(mock).not.toHaveBeenCalled();
    }
    expect(console.info).toHaveBeenCalledWith("STAGING_WEBHOOK_FIRST_SUCCESS_RETURN_SKIPPED", { bookingId: WEBHOOK_FIRST_BOOKING_ID });
  });

  it("does not bypass booking ownership for a configured ID", async () => {
    prepareSelectedBooking();
    findClientBookingMock.mockResolvedValueOnce(null);
    await expect(syncClientStripeCheckoutSuccess("other-client", WEBHOOK_FIRST_BOOKING_ID, "cs_test_webhook_first"))
      .rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" });
    expect(console.info).not.toHaveBeenCalled();
    expect(updatePaymentMock).not.toHaveBeenCalled();
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("does not send email or mutate an already-paid selected Payment", async () => {
    prepareSelectedBooking();
    payment.paymentStatus = PaymentStatus.PAID;
    findClientBookingMock.mockResolvedValueOnce({ id: WEBHOOK_FIRST_BOOKING_ID, payment });
    expect((await syncClientStripeCheckoutSuccess("client-id", WEBHOOK_FIRST_BOOKING_ID, "cs_test_webhook_first")).status).toBe("paid");
    expect(successEmailMock).not.toHaveBeenCalled();
    expect(updatePaymentMock).not.toHaveBeenCalled();
  });

  it.each(["absent", "another-booking"])("preserves normal success-return reconciliation: %s", async configuration => {
    enableWebhookFirstStagingGuard();
    if (configuration === "absent") vi.stubEnv("STRIPE_STAGING_WEBHOOK_FIRST_BOOKING_ID", "");
    findClientBookingMock.mockResolvedValue({ id: "booking-id", payment });
    await syncClientStripeCheckoutSuccess("client-id", "booking-id", "cs_123");
    expect(retrieveCheckoutSessionMock).toHaveBeenCalledOnce();
    expect(payment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "STRIPE_CHECKOUT_SESSION_RECONCILED_ON_SUCCESS_RETURN" }));
  });

  it("reconciles even the configured booking normally outside staging", async () => {
    prepareSelectedBooking();
    vi.stubEnv("APP_URL", "https://platform.theraply.online");
    retrieveCheckoutSessionMock.mockResolvedValueOnce({
      id: "cs_test_webhook_first", status: "complete", payment_status: "paid",
      metadata: { bookingId: WEBHOOK_FIRST_BOOKING_ID },
      payment_intent: { id: "pi_test_first", latest_charge: "ch_test_first" },
      amount_total: 299, currency: "gbp",
    });
    await syncClientStripeCheckoutSuccess("client-id", WEBHOOK_FIRST_BOOKING_ID, "cs_test_webhook_first");
    expect(retrieveCheckoutSessionMock).toHaveBeenCalledOnce();
    expect(payment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(console.info).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "STRIPE_CHECKOUT_SESSION_RECONCILED_ON_SUCCESS_RETURN" }));
  });

  it.each(["checkout.session.completed", "payment_intent.succeeded"])("keeps the real PLATFORM handler writing PAID for the selected booking: %s", async type => {
    prepareSelectedBooking();
    await syncClientStripeCheckoutSuccess("client-id", WEBHOOK_FIRST_BOOKING_ID, "cs_test_webhook_first");
    expect(payment.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(payment.paidAt).toBeNull();
    const metadata = { bookingId: WEBHOOK_FIRST_BOOKING_ID, paymentId: "payment-id", bookingFeeAmount: "199" };
    const object = type === "checkout.session.completed"
      ? { id: "cs_test_webhook_first", amount_total: 299, currency: "gbp", payment_intent: "pi_test_first", metadata }
      : { id: "pi_test_first", amount: 299, amount_received: 299, currency: "gbp", latest_charge: "ch_test_first", metadata };
    await processStripeWebhookEvent({ id: "evt_test_first", type, livemode: false, data: { object } } as unknown as Stripe.Event, "PLATFORM");
    expect(reserveEventMock).toHaveBeenCalledOnce();
    expect(updatePaymentMock).toHaveBeenCalledOnce();
    expect(payment).toMatchObject({ paymentStatus: PaymentStatus.PAID, bookingFeeAmount: 199,
      stripeChargeAmount: 299, therapistAmount: 90, platformFeeAmount: 10 });
    expect(payment.paidAt).toBeInstanceOf(Date);
    expect(successEmailMock).toHaveBeenCalledWith(WEBHOOK_FIRST_BOOKING_ID);
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      entityId: "payment-id", action: type === "checkout.session.completed" ? "STRIPE_CHECKOUT_SESSION_COMPLETED" : "STRIPE_PAYMENT_INTENT_SUCCEEDED",
    }));
    expect(auditMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "STRIPE_CHECKOUT_SESSION_RECONCILED_ON_SUCCESS_RETURN" }));
    expect(retrieveCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
