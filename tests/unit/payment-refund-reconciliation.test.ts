import { BookingStatus, PaymentStatus, PaymentTransferStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markStripeChargeRefunded } from "@/server/services/payment-flow.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const lockMock = vi.hoisted(() => vi.fn());
const issueCreditMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: findBookingMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/server/services/client-credit.service", () => ({
  acquireFinancialTransactionLock: lockMock,
  applyClientCreditToPaymentInTransaction: vi.fn(),
  issueClientCreditInTransaction: issueCreditMock,
  reverseClientCreditApplication: vi.fn(),
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: auditMock,
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendPaymentSuccessfulEmailBestEffort: vi.fn(),
  sendPaymentFailedEmailBestEffort: vi.fn(),
}));

function buildPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-id",
    bookingId: "booking-id",
    amount: 10000,
    currency: "gbp",
    paymentStatus: PaymentStatus.PAID,
    paidAt: new Date("2026-08-22T10:00:00Z"),
    creditAppliedAmount: 10000,
    stripeCheckoutSessionId: null,
    stripeChargeId: null,
    stripeRefundId: null,
    stripeTransferGroup: "theraply_booking_booking-id",
    platformFeeAmount: 1000,
    therapistAmount: 9000,
    transferStatus: PaymentTransferStatus.NOT_ELIGIBLE,
    ...overrides,
  };
}

function configureRefund(paymentOverrides: Record<string, unknown> = {}) {
  let currentPayment = buildPayment(paymentOverrides);
  const tx = {
    payment: {
      findUnique: vi.fn(async () => currentPayment),
      update: vi.fn(async ({ data }) => {
        currentPayment = { ...currentPayment, ...data };
        return currentPayment;
      }),
    },
    booking: {
      update: vi.fn().mockResolvedValue({}),
    },
  };

  findBookingMock.mockResolvedValue({
    id: "booking-id",
    clientId: "client-id",
    bookingStatus: BookingStatus.CONFIRMED,
    paymentDueBy: null,
    startsAt: new Date("2026-09-01T10:00:00Z"),
    compensationResolutionType: null,
    compensationResolvedAt: null,
    payment: currentPayment,
  });
  transactionMock.mockImplementation(async (callback) => callback(tx));

  return { tx, getPayment: () => currentPayment };
}

beforeEach(() => {
  vi.clearAllMocks();
  issueCreditMock.mockResolvedValue({ amount: 10000, issuedNow: true });
  auditMock.mockResolvedValue(undefined);
});

describe("payment refund reconciliation", () => {
  it.each([0, 2000, 8000])("restores %i credit once while retaining the fee on repeated events", async (credit) => {
    const { tx, getPayment } = configureRefund({
      amount: 8000, bookingFeeAmount: 199, creditAppliedAmount: credit,
      clientPayableAmount: 8000, stripeChargeAmount: 8199 - credit,
      promoDiscountAmount: 0, therapistAmount: 7200, platformFeeAmount: 800,
    });
    const input = { refundId: credit === 8000 ? null : "re_session", refundedAmount: 8000 - credit, refundReason: "Cancelled" };
    await markStripeChargeRefunded("booking-id", input);
    await markStripeChargeRefunded("booking-id", input);
    expect(tx.payment.update).toHaveBeenCalledTimes(1);
    expect(issueCreditMock).toHaveBeenCalledTimes(credit ? 1 : 0);
    if (credit) expect(issueCreditMock).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: credit }));
    expect(getPayment()).toMatchObject({ bookingFeeAmount: 199, refundedAmount: 8000 - credit, paymentStatus: PaymentStatus.REFUNDED });
  });

  it.each([100, 8199])("rejects unsupported external refund amount %i without credit restoration", async (amount) => {
    const { tx } = configureRefund({
      amount: 8000, bookingFeeAmount: 199, creditAppliedAmount: 0,
      clientPayableAmount: 8000, stripeChargeAmount: 8199,
      promoDiscountAmount: 0, therapistAmount: 7200, platformFeeAmount: 800,
    });
    await expect(markStripeChargeRefunded("booking-id", { refundId: "re_external", refundedAmount: amount, refundReason: "External" }))
      .rejects.toMatchObject({ code: "PAYMENT_SNAPSHOT_MISMATCH" });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(issueCreditMock).not.toHaveBeenCalled();
  });

  it("atomically marks a full-credit payment refunded and restores credit", async () => {
    const { tx, getPayment } = configureRefund();

    const result = await markStripeChargeRefunded("booking-id", {
      refundId: null,
      refundedAmount: 0,
      refundReason: "Booking cancelled.",
    });

    expect(result.paymentStatus).toBe(PaymentStatus.REFUNDED);
    expect(getPayment()).toEqual(expect.objectContaining({
      paymentStatus: PaymentStatus.REFUNDED,
      stripeRefundId: null,
      refundedAmount: 0,
    }));
    expect(issueCreditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amount: 10000, paymentId: "payment-id" }),
    );
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ compensationResolutionType: "REFUND" }),
      }),
    );
  });

  it("keeps duplicate refund reconciliation idempotent", async () => {
    configureRefund({ paymentStatus: PaymentStatus.REFUNDED });

    await markStripeChargeRefunded("booking-id", {
      refundId: null,
      refundedAmount: 0,
      refundReason: "Booking cancelled.",
    });

    expect(issueCreditMock).not.toHaveBeenCalled();
  });

  it("does not mark compensation resolved when an external refund follows a transfer", async () => {
    const { tx } = configureRefund({ transferStatus: PaymentTransferStatus.TRANSFERRED });

    await markStripeChargeRefunded("booking-id", {
      refundId: "re_external",
      refundedAmount: 10000,
      refundReason: "Stripe refund processed.",
    });

    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REFUND_TRANSFER_RECONCILIATION_REQUIRED" }),
    );
  });

  it("restores only the frozen client credit for a full-credit promo payment", async () => {
    const { tx, getPayment } = configureRefund({
      creditAppliedAmount: 9500,
      promoCodeSnapshot: "SAVE5",
      promoDiscountPercent: 5,
      promoDiscountAmount: 500,
      clientPayableAmount: 9500,
      stripeChargeAmount: 0,
      platformFeeAmount: 500,
    });
    issueCreditMock.mockResolvedValue({ amount: 9500, issuedNow: true });

    await markStripeChargeRefunded("booking-id", {
      refundId: null,
      refundedAmount: 0,
      refundReason: "Booking cancelled.",
    });

    expect(issueCreditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amount: 9500 }),
    );
    expect(getPayment()).toEqual(
      expect.objectContaining({
        promoCodeSnapshot: "SAVE5",
        promoDiscountAmount: 500,
        creditAppliedAmount: 9500,
      }),
    );
  });
});
