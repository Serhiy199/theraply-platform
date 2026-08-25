import { BookingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PaymentFlowServiceError,
  previewClientPromoCode,
} from "@/server/services/payment-flow.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const findPromoCodeMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findFirst: findBookingMock },
    promoCode: { findUnique: findPromoCodeMock },
  },
}));

vi.mock("@/server/services/stripe-connect.service", () => ({
  isStripeConnectReady: () => true,
}));

vi.mock("@/server/services/client-credit.service", () => ({
  acquireFinancialTransactionLock: vi.fn(),
  applyClientCreditToPaymentInTransaction: vi.fn(),
  issueClientCreditInTransaction: vi.fn(),
  reverseClientCreditApplication: vi.fn(),
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: auditMock,
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendPaymentSuccessfulEmailBestEffort: vi.fn(),
  sendPaymentFailedEmailBestEffort: vi.fn(),
}));

function buildBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-id",
    clientId: "client-id",
    bookingStatus: BookingStatus.CONFIRMED,
    startsAt: new Date("2099-09-02T10:00:00Z"),
    endsAt: new Date("2099-09-02T11:00:00Z"),
    paymentDueBy: new Date("2099-09-01T10:00:00Z"),
    therapist: {
      therapistProfile: {
        sessionPricePence: 10000,
        stripeAccountId: "acct_123",
        stripeOnboardingStatus: "READY",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    },
    client: {
      clientCreditBalance: { balance: 2000, currency: "gbp" },
    },
    payment: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findBookingMock.mockResolvedValue(buildBooking());
  auditMock.mockResolvedValue(undefined);
});

describe("client promo preview", () => {
  it.each([
    { percent: 1, discount: 100, payable: 9900, stripe: 7900 },
    { percent: 5, discount: 500, payable: 9500, stripe: 7500 },
    { percent: 10, discount: 1000, payable: 9000, stripe: 7000 },
  ])("returns the canonical $percent% breakdown", async (expected) => {
    findPromoCodeMock.mockResolvedValue({
      id: "promo-id",
      code: `SAVE${expected.percent}`,
      discountPercent: expected.percent,
      isActive: true,
      expiresAt: null,
    });

    const result = await previewClientPromoCode("client-id", {
      bookingId: "booking-id",
      promoCode: ` save${expected.percent} `,
    });

    expect(result).toMatchObject({
      valid: true,
      normalizedCode: `SAVE${expected.percent}`,
      discountPercent: expected.percent,
      promoDiscountAmount: expected.discount,
      clientPayableAmount: expected.payable,
      projectedCreditAppliedAmount: 2000,
      projectedStripeChargeAmount: expected.stripe,
    });
    expect(findPromoCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: `SAVE${expected.percent}` } }),
    );
  });

  it.each([
    ["inactive", { id: "promo-id", code: "SAVE5", discountPercent: 5, isActive: false, expiresAt: null }],
    ["expired", { id: "promo-id", code: "SAVE5", discountPercent: 5, isActive: true, expiresAt: new Date("2020-01-01T00:00:00Z") }],
    ["unknown", null],
  ])("rejects an %s promo without campaign-detail leakage", async (_label, promo) => {
    findPromoCodeMock.mockResolvedValue(promo);

    await expect(
      previewClientPromoCode("client-id", {
        bookingId: "booking-id",
        promoCode: "SAVE5",
      }),
    ).rejects.toMatchObject({ code: "PROMO_CODE_INVALID" } satisfies Partial<PaymentFlowServiceError>);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROMO_CODE_REJECTED" }),
    );
  });

  it("fails ownership checks before promo resolution", async () => {
    findBookingMock.mockResolvedValue(null);

    await expect(
      previewClientPromoCode("other-client", {
        bookingId: "booking-id",
        promoCode: "SAVE5",
      }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" } satisfies Partial<PaymentFlowServiceError>);
    expect(findPromoCodeMock).not.toHaveBeenCalled();
  });

  it("rejects an unconfirmed booking before promo resolution", async () => {
    findBookingMock.mockResolvedValue(
      buildBooking({ bookingStatus: BookingStatus.PENDING_THERAPIST }),
    );

    await expect(
      previewClientPromoCode("client-id", {
        bookingId: "booking-id",
        promoCode: "SAVE5",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_ELIGIBLE" } satisfies Partial<PaymentFlowServiceError>);
    expect(findPromoCodeMock).not.toHaveBeenCalled();
  });
});
