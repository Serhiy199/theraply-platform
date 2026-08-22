import { BookingStatus, PaymentStatus, PaymentTransferStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markStripeCheckoutSessionCompleted,
  markStripePaymentIntentSucceeded,
  PaymentFlowServiceError,
} from "@/server/services/payment-flow.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const updatePaymentMock = vi.hoisted(() => vi.fn());
const updateBookingMock = vi.hoisted(() => vi.fn());
const successEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: findBookingMock,
      update: updateBookingMock,
    },
    payment: {
      update: updatePaymentMock,
    },
  },
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendPaymentSuccessfulEmailBestEffort: successEmailMock,
  sendPaymentFailedEmailBestEffort: vi.fn(),
}));

vi.mock("@/server/services/client-credit.service", () => ({
  acquireFinancialTransactionLock: vi.fn(),
  applyClientCreditToPaymentInTransaction: vi.fn(),
  issueClientCreditInTransaction: vi.fn(),
  reverseClientCreditApplication: vi.fn(),
}));

let payment: Record<string, unknown>;

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
  resetPayment();
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
  successEmailMock.mockResolvedValue(undefined);
});

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
  });

  it("keeps duplicate completion idempotent and sends one success email", async () => {
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);
    await markStripeCheckoutSessionCompleted("booking-id", checkoutSuccess);

    expect(successEmailMock).toHaveBeenCalledTimes(1);
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
