import { PaymentStatus, PaymentTransferStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  refundPlatformCancellationIfEligible,
  RefundServiceError,
} from "@/server/services/refund.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const refundCreateMock = vi.hoisted(() => vi.fn());
const markRefundedMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: findBookingMock,
    },
  },
}));

vi.mock("@/lib/stripe/stripe-config", () => ({
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getStripeClient: () => ({
    refunds: {
      create: refundCreateMock,
    },
  }),
}));

vi.mock("@/server/services/payment-flow.service", () => ({
  markStripeChargeRefunded: markRefundedMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: auditMock,
  logDiagnosticEvent: vi.fn(),
}));

function buildBooking(paymentOverrides: Record<string, unknown> = {}) {
  return {
    id: "booking-id",
    startsAt: new Date("2026-09-01T10:00:00Z"),
    clientId: "client-id",
    therapistId: "therapist-id",
    payment: {
      id: "payment-id",
      amount: 10000,
      currency: "gbp",
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: "pi_123",
      stripeRefundId: null,
      refundedAmount: null,
      creditAppliedAmount: 0,
      promoCodeSnapshot: null,
      promoDiscountPercent: null,
      promoDiscountAmount: null,
      clientPayableAmount: null,
      stripeChargeAmount: null,
      platformFeeAmount: null,
      therapistAmount: null,
      transferStatus: PaymentTransferStatus.NOT_ELIGIBLE,
      ...paymentOverrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findBookingMock.mockResolvedValue(buildBooking());
  refundCreateMock.mockResolvedValue({ id: "re_123", amount: 10000 });
  markRefundedMock.mockResolvedValue({
    paymentId: "payment-id",
    bookingId: "booking-id",
    paymentStatus: PaymentStatus.REFUNDED,
  });
  auditMock.mockResolvedValue(undefined);
});

const refundInput = {
  bookingId: "booking-id",
  actorUserId: "admin-id",
  trigger: "ADMIN_MANUAL_CANCELLATION" as const,
  businessReason: "Admin cancelled the booking.",
};

describe("refund service financial settlement", () => {
  it.each([0, 2000, 8000])("retains the fee with %i session credit, including therapist cancellations", async (credit) => {
    findBookingMock.mockResolvedValue(buildBooking({
      amount: 8000, bookingFeeAmount: 199, creditAppliedAmount: credit,
      promoDiscountAmount: 0, clientPayableAmount: 8000,
      stripeChargeAmount: 8199 - credit, platformFeeAmount: 800, therapistAmount: 7200,
    }));
    refundCreateMock.mockResolvedValue({ id: "re_session", amount: 8000 - credit, status: "succeeded" });
    const result = await refundPlatformCancellationIfEligible({ ...refundInput, trigger: "THERAPIST_CANCELLATION" });
    expect(result.refundedAmount).toBe(8000 - credit);
    if (credit === 8000) {
      expect(refundCreateMock).not.toHaveBeenCalled();
    } else {
      expect(refundCreateMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 8000 - credit }),
        { idempotencyKey: "theraply-session-refund-payment-id" });
    }
    expect(markRefundedMock).toHaveBeenCalledWith("booking-id", expect.objectContaining({ refundedAmount: 8000 - credit }));
  });

  it("does not restore credit before a pending Stripe refund succeeds", async () => {
    refundCreateMock.mockResolvedValue({ id: "re_pending", amount: 10000, status: "pending" });
    await expect(refundPlatformCancellationIfEligible(refundInput)).rejects.toMatchObject({ code: "REFUND_CREATE_FAILED" });
    expect(markRefundedMock).not.toHaveBeenCalled();
  });

  it("refunds a Stripe-only payment", async () => {
    const result = await refundPlatformCancellationIfEligible(refundInput);

    expect(result).toEqual({
      status: "refunded",
      reason: "REFUNDED",
      refundId: "re_123",
      refundedAmount: 10000,
    });
    expect(refundCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_123" }),
      expect.objectContaining({ idempotencyKey: "theraply-session-refund-payment-id" }),
    );
  });

  it("refunds the Stripe portion and restores the snapshotted partial credit", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({ creditAppliedAmount: 2500 }),
    );
    refundCreateMock.mockResolvedValue({ id: "re_partial", amount: 7500 });

    await refundPlatformCancellationIfEligible(refundInput);

    expect(markRefundedMock).toHaveBeenCalledWith("booking-id", {
      refundId: "re_partial",
      refundedAmount: 7500,
      refundReason: refundInput.businessReason,
    });
  });

  it("restores a full-credit payment without calling Stripe", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({
        creditAppliedAmount: 10000,
        stripePaymentIntentId: null,
      }),
    );

    const result = await refundPlatformCancellationIfEligible(refundInput);

    expect(result).toEqual({
      status: "refunded",
      reason: "REFUNDED",
      refundId: null,
      refundedAmount: 0,
    });
    expect(refundCreateMock).not.toHaveBeenCalled();
    expect(markRefundedMock).toHaveBeenCalledWith("booking-id", {
      refundId: null,
      refundedAmount: 0,
      refundReason: refundInput.businessReason,
    });
  });

  it("keeps duplicate refunds idempotent", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({
        paymentStatus: PaymentStatus.REFUNDED,
        stripeRefundId: "re_existing",
        refundedAmount: 7500,
      }),
    );

    const result = await refundPlatformCancellationIfEligible(refundInput);

    expect(result).toEqual({
      status: "skipped",
      reason: "ALREADY_REFUNDED",
      refundId: "re_existing",
      refundedAmount: 7500,
    });
    expect(refundCreateMock).not.toHaveBeenCalled();
  });

  it("stops before refunding when a therapist transfer is already complete", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({ transferStatus: PaymentTransferStatus.TRANSFERRED }),
    );

    await expect(refundPlatformCancellationIfEligible(refundInput)).rejects.toMatchObject({
      code: "TRANSFER_RECONCILIATION_REQUIRED",
    } satisfies Partial<RefundServiceError>);
    expect(refundCreateMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REFUND_TRANSFER_RECONCILIATION_REQUIRED" }),
    );
  });

  it("refunds only the captured Stripe amount for a promo payment", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({
        promoCodeSnapshot: "SAVE5",
        promoDiscountPercent: 5,
        promoDiscountAmount: 500,
        clientPayableAmount: 9500,
        stripeChargeAmount: 9500,
        platformFeeAmount: 500,
        therapistAmount: 9000,
      }),
    );
    refundCreateMock.mockResolvedValue({ id: "re_promo", amount: 9500 });

    await refundPlatformCancellationIfEligible(refundInput);

    expect(markRefundedMock).toHaveBeenCalledWith("booking-id", {
      refundId: "re_promo",
      refundedAmount: 9500,
      refundReason: refundInput.businessReason,
    });
  });

  it("refunds Stripe and restores credit without restoring promo value", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({
        creditAppliedAmount: 2000,
        promoCodeSnapshot: "SAVE5",
        promoDiscountPercent: 5,
        promoDiscountAmount: 500,
        clientPayableAmount: 9500,
        stripeChargeAmount: 7500,
        platformFeeAmount: 500,
        therapistAmount: 9000,
      }),
    );
    refundCreateMock.mockResolvedValue({ id: "re_promo_credit", amount: 7500 });

    await refundPlatformCancellationIfEligible(refundInput);

    expect(markRefundedMock).toHaveBeenCalledWith("booking-id", {
      refundId: "re_promo_credit",
      refundedAmount: 7500,
      refundReason: refundInput.businessReason,
    });
  });

  it("restores only client credit for a full-credit promo payment", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({
        stripePaymentIntentId: null,
        creditAppliedAmount: 9500,
        promoCodeSnapshot: "SAVE5",
        promoDiscountPercent: 5,
        promoDiscountAmount: 500,
        clientPayableAmount: 9500,
        stripeChargeAmount: 0,
        platformFeeAmount: 500,
        therapistAmount: 9000,
      }),
    );

    await refundPlatformCancellationIfEligible(refundInput);

    expect(refundCreateMock).not.toHaveBeenCalled();
    expect(markRefundedMock).toHaveBeenCalledWith("booking-id", {
      refundId: null,
      refundedAmount: 0,
      refundReason: refundInput.businessReason,
    });
  });
});
