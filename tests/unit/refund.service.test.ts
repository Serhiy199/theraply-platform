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
});
