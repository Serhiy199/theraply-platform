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
  createAuditLogEntryBestEffort: vi.fn(),
}));

vi.mock("@/server/services/transactional-email-events.service", () => ({
  sendPaymentSuccessfulEmailBestEffort: vi.fn(),
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
    expect(tx.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          paymentStatus: PaymentStatus.PAID,
          amount: 10000,
          therapistAmount: 9000,
          platformFeeAmount: 1000,
          creditAppliedAmount: 10000,
        }),
      }),
    );
  });

  it("creates partial-credit Checkout with a versioned idempotency key", async () => {
    configureTransaction(2500);

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
    expect(lockMock).toHaveBeenCalledTimes(2);
  });

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
});
