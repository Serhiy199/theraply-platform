import { PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStripeCheckoutSession } from "@/server/services/payment-flow.service";

const transactionMock = vi.hoisted(() => vi.fn());
const paymentUpdateMock = vi.hoisted(() => vi.fn());
const checkoutCreateMock = vi.hoisted(() => vi.fn());
const checkoutExpireMock = vi.hoisted(() => vi.fn());
const lockMock = vi.hoisted(() => vi.fn());
const applyCreditMock = vi.hoisted(() => vi.fn());
const reverseCreditMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());
const successEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: transactionMock,
    payment: {
      update: paymentUpdateMock,
    },
  },
}));

vi.mock("@/lib/stripe/stripe-config", () => ({
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: checkoutCreateMock,
        expire: checkoutExpireMock,
      },
    },
  }),
}));

vi.mock("@/server/services/stripe-connect.service", () => ({
  isStripeConnectReady: () => true,
}));

vi.mock("@/server/services/client-credit.service", () => ({
  acquireFinancialTransactionLock: lockMock,
  applyClientCreditToPaymentInTransaction: applyCreditMock,
  issueClientCreditInTransaction: vi.fn(),
  reverseClientCreditApplication: reverseCreditMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: auditMock,
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendPaymentSuccessfulEmailBestEffort: successEmailMock,
  sendPaymentFailedEmailBestEffort: vi.fn(),
}));

function buildBooking(creditBalance: number) {
  return {
    id: "booking-id",
    clientId: "client-id",
    therapistId: "therapist-id",
    bookingStatus: "CONFIRMED",
    startsAt: new Date("2027-09-02T10:00:00Z"),
    endsAt: new Date("2027-09-02T11:00:00Z"),
    paymentDueBy: new Date("2027-09-01T10:00:00Z"),
    client: {
      email: "client@example.com",
      firstName: "Client",
      lastName: "User",
      clientCreditBalance: {
        balance: creditBalance,
        currency: "gbp",
      },
    },
    therapist: {
      email: "therapist@example.com",
      firstName: "Therapist",
      lastName: "User",
      therapistProfile: {
        displayName: "Therapist User",
        sessionPricePence: 10000,
        stripeAccountId: "acct_123",
        stripeOnboardingStatus: "READY",
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    },
    payment: null,
  };
}

function configureTransaction(creditBalance: number) {
  const booking = buildBooking(creditBalance);
  const tx = {
    booking: {
      findFirst: vi.fn().mockResolvedValue(booking),
    },
    payment: {
      upsert: vi.fn().mockResolvedValue({ id: "payment-id" }),
    },
    promoCode: {
      findUnique: vi.fn(),
    },
  };

  transactionMock.mockImplementation(async (callback) => callback(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  applyCreditMock.mockImplementation(async (_tx, input) => ({
    amount: input.amount,
    appliedNow: input.amount > 0,
  }));
  reverseCreditMock.mockResolvedValue(2500);
  paymentUpdateMock.mockResolvedValue({});
  checkoutCreateMock.mockResolvedValue({
    id: "cs_123",
    url: "https://checkout.stripe.test/cs_123",
    payment_intent: "pi_123",
  });
  checkoutExpireMock.mockResolvedValue({});
  auditMock.mockResolvedValue(undefined);
});

const checkoutInput = {
  bookingId: "booking-id",
  successUrl: "https://app.example/client/payments/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://app.example/client/payments/failed",
};

describe("payment checkout settlement", () => {
  it("settles full credit atomically without creating Stripe objects", async () => {
    const tx = configureTransaction(10000);

    const result = await createClientStripeCheckoutSession("client-id", checkoutInput);

    expect(result).toEqual(expect.objectContaining({
      completedFromCredit: true,
      amount: 10000,
      creditAppliedAmount: 10000,
      chargeAmount: 0,
    }));
    expect(checkoutCreateMock).not.toHaveBeenCalled();
    expect(successEmailMock).toHaveBeenCalledOnce();
    expect(successEmailMock).toHaveBeenCalledWith("booking-id");
    expect(tx.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          paymentStatus: PaymentStatus.PAID,
          amount: 10000,
          promoDiscountPercent: null,
          therapistAmount: 9000,
          platformFeeAmount: 1000,
          creditAppliedAmount: 10000,
        }),
      }),
    );
  });

  it("creates partial-credit Checkout with a versioned idempotency key", async () => {
    const tx = configureTransaction(2500);

    const result = await createClientStripeCheckoutSession("client-id", checkoutInput);

    expect(result).toEqual(expect.objectContaining({
      completedFromCredit: false,
      chargeAmount: 7500,
      creditAppliedAmount: 2500,
    }));
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 7500 }),
          }),
        ],
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^theraply-checkout-payment-id-\d+$/),
      }),
    );
    expect(tx.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ promoDiscountPercent: null }),
        create: expect.objectContaining({ promoDiscountPercent: null }),
      }),
    );
    expect(lockMock).toHaveBeenCalledTimes(2);
  });

  it.each(["UTC", "Europe/Kyiv", "America/New_York"])(
    "formats the Checkout session description in explicit UK time under runtime TZ %s",
    async (runtimeTimeZone) => {
      vi.stubEnv("TZ", runtimeTimeZone);
      configureTransaction(0);

      await createClientStripeCheckoutSession("client-id", checkoutInput);

      expect(checkoutCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                product_data: expect.objectContaining({
                  description: "Confirmed session starting 2 Sept 2027, 11:00",
                }),
              }),
            }),
          ],
        }),
        expect.anything(),
      );
    },
  );

  it("reverses reserved credit and marks Payment failed when Checkout creation fails", async () => {
    configureTransaction(2500);
    checkoutCreateMock.mockRejectedValue(new Error("Stripe unavailable"));

    await expect(
      createClientStripeCheckoutSession("client-id", checkoutInput),
    ).rejects.toMatchObject({ code: "CHECKOUT_SESSION_CREATE_FAILED" });

    expect(reverseCreditMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "payment-id", amount: 2500 }),
    );
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentStatus: PaymentStatus.FAILED,
          creditAppliedAmount: null,
        }),
      }),
    );
  });

  it.each([
    { percent: 1, charge: 9900, platform: 900 },
    { percent: 5, charge: 9500, platform: 500 },
    { percent: 10, charge: 9000, platform: 0 },
  ])("freezes a canonical $percent% promo snapshot", async (expected) => {
    const tx = configureTransaction(0);
    tx.promoCode.findUnique.mockResolvedValue({
      id: "promo-id",
      code: `SAVE${expected.percent}`,
      discountPercent: expected.percent,
      isActive: true,
      expiresAt: null,
    });

    const result = await createClientStripeCheckoutSession("client-id", {
      ...checkoutInput,
      promoCode: ` save${expected.percent} `,
    });

    expect(result.chargeAmount).toBe(expected.charge);
    expect(tx.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          promoCodeId: "promo-id",
          promoCodeSnapshot: `SAVE${expected.percent}`,
          promoDiscountPercent: expected.percent,
          promoDiscountAmount: 10000 - expected.charge,
          clientPayableAmount: expected.charge,
          stripeChargeAmount: expected.charge,
          therapistAmount: 9000,
          platformFeeAmount: expected.platform,
        }),
      }),
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROMO_CODE_APPLIED" }),
    );
  });

  it.each([
    { credit: 500, applied: 500, stripe: 9000 },
    { credit: 2000, applied: 2000, stripe: 7500 },
    { credit: 10000, applied: 9500, stripe: 0 },
  ])("applies client credit after the promo for %#", async (expected) => {
    const tx = configureTransaction(expected.credit);
    tx.promoCode.findUnique.mockResolvedValue({
      id: "promo-id",
      code: "SAVE5",
      discountPercent: 5,
      isActive: true,
      expiresAt: null,
    });

    const result = await createClientStripeCheckoutSession("client-id", {
      ...checkoutInput,
      promoCode: "SAVE5",
    });

    expect(result).toMatchObject({
      creditAppliedAmount: expected.applied,
      chargeAmount: expected.stripe,
      clientPayableAmount: 9500,
      promoDiscountAmount: 500,
    });
    expect(tx.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          creditAppliedAmount: expected.applied,
          stripeChargeAmount: expected.stripe,
        }),
      }),
    );
  });

  it.each([
    ["inactive", { id: "promo-id", code: "SAVE5", discountPercent: 5, isActive: false, expiresAt: null }],
    ["expired", { id: "promo-id", code: "SAVE5", discountPercent: 5, isActive: true, expiresAt: new Date("2020-01-01T00:00:00Z") }],
    ["invalid-discount", { id: "promo-id", code: "SAVE5", discountPercent: 11, isActive: true, expiresAt: null }],
    ["unknown", null],
  ])("rejects an %s promo before creating a Payment", async (_label, promo) => {
    const tx = configureTransaction(0);
    tx.promoCode.findUnique.mockResolvedValue(promo);

    await expect(
      createClientStripeCheckoutSession("client-id", {
        ...checkoutInput,
        promoCode: "SAVE5",
      }),
    ).rejects.toMatchObject({ code: "PROMO_CODE_INVALID" });
    expect(tx.payment.upsert).not.toHaveBeenCalled();
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed promo before querying campaign data", async () => {
    const tx = configureTransaction(0);

    await expect(
      createClientStripeCheckoutSession("client-id", {
        ...checkoutInput,
        promoCode: "SAVE 5",
      }),
    ).rejects.toMatchObject({ code: "PROMO_CODE_INVALID" });
    expect(tx.promoCode.findUnique).not.toHaveBeenCalled();
    expect(tx.payment.upsert).not.toHaveBeenCalled();
  });
});
