import {
  BookingStatus,
  PaymentStatus,
  PaymentTransferStatus,
  SessionOutcome,
  SessionStatus,
  StripeConnectOnboardingStatus,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTherapistTransferForBooking } from "@/server/services/therapist-transfer.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const updatePaymentMock = vi.hoisted(() => vi.fn());
const createAuditMock = vi.hoisted(() => vi.fn());
const transferCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: findBookingMock,
      findMany: vi.fn(),
    },
    payment: {
      update: updatePaymentMock,
    },
  },
}));

vi.mock("@/lib/stripe/stripe-config", () => ({
  isStripeConfigured: () => true,
}));

vi.mock("@/lib/stripe/stripe", () => ({
  getStripeClient: () => ({
    transfers: {
      create: transferCreateMock,
    },
  }),
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: createAuditMock,
  logDiagnosticEvent: vi.fn(),
}));

function buildTransferBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-id",
    bookingStatus: BookingStatus.COMPLETED,
    clientId: "client-user-id",
    therapistId: "therapist-user-id",
    startsAt: new Date("2026-06-09T10:00:00Z"),
    endsAt: new Date("2026-06-09T11:00:00Z"),
    cancelledAt: null,
    cancelledByUserId: null,
    session: {
      id: "session-id",
      sessionStatus: SessionStatus.DONE,
      outcome: SessionOutcome.COMPLETED,
      completedAt: new Date("2026-06-09T11:05:00Z"),
    },
    therapist: {
      therapistProfile: {
        stripeAccountId: "acct_123",
        stripeOnboardingStatus: StripeConnectOnboardingStatus.READY,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    },
    payment: {
      id: "payment-id",
      amount: 10000,
      currency: "gbp",
      paymentStatus: PaymentStatus.PAID,
      transferStatus: PaymentTransferStatus.NOT_ELIGIBLE,
      stripeChargeId: "ch_123",
      stripeTransferGroup: "theraply_booking_booking-id",
      stripeTransferId: null,
      therapistAmount: 9000,
      transferredAt: null,
      transferAttemptCount: 0,
    },
    ...overrides,
  };
}

beforeEach(() => {
  findBookingMock.mockResolvedValue(buildTransferBooking());
  updatePaymentMock.mockResolvedValue({});
  createAuditMock.mockResolvedValue(undefined);
  transferCreateMock.mockResolvedValue({ id: "tr_123" });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("therapist transfer service", () => {
  it("skips transfer when payment is not paid", async () => {
    findBookingMock.mockResolvedValue(
      buildTransferBooking({
        payment: {
          ...buildTransferBooking().payment,
          paymentStatus: PaymentStatus.FAILED,
        },
      }),
    );

    const result = await createTherapistTransferForBooking("booking-id", "admin-id");

    expect(result).toEqual({
      status: "skipped",
      bookingId: "booking-id",
      paymentId: "payment-id",
      reason: "PAYMENT_NOT_PAID",
    });
    expect(transferCreateMock).not.toHaveBeenCalled();
  });

  it("skips transfer when it was already transferred", async () => {
    findBookingMock.mockResolvedValue(
      buildTransferBooking({
        payment: {
          ...buildTransferBooking().payment,
          transferStatus: PaymentTransferStatus.TRANSFERRED,
          stripeTransferId: "tr_existing",
        },
      }),
    );

    const result = await createTherapistTransferForBooking("booking-id", "admin-id");

    expect(result.status).toBe("skipped");
    expect(transferCreateMock).not.toHaveBeenCalled();
  });

  it("creates a transfer with source transaction and idempotency key", async () => {
    const result = await createTherapistTransferForBooking("booking-id", "admin-id");

    expect(result).toEqual({
      status: "transferred",
      bookingId: "booking-id",
      paymentId: "payment-id",
      stripeTransferId: "tr_123",
    });
    expect(transferCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 9000,
        currency: "gbp",
        destination: "acct_123",
        source_transaction: "ch_123",
        transfer_group: "theraply_booking_booking-id",
        metadata: expect.objectContaining({
          settlementReason: "SESSION_COMPLETED",
        }),
      }),
      {
        idempotencyKey: "theraply-transfer-payment-id",
      },
    );
    expect(updatePaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transferStatus: PaymentTransferStatus.TRANSFERRED,
          stripeTransferId: "tr_123",
        }),
      }),
    );
  });

  it("creates a transfer for a paid late client cancellation", async () => {
    findBookingMock.mockResolvedValue(
      buildTransferBooking({
        bookingStatus: BookingStatus.CANCELLED,
        startsAt: new Date("2026-06-09T10:00:00Z"),
        cancelledAt: new Date("2026-06-09T08:30:00Z"),
        cancelledByUserId: "client-user-id",
        session: {
          id: "session-id",
          sessionStatus: SessionStatus.CANCELLED,
          outcome: null,
          completedAt: null,
        },
      }),
    );

    const result = await createTherapistTransferForBooking("booking-id", "client-user-id");

    expect(result.status).toBe("transferred");
    expect(transferCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 9000,
        metadata: expect.objectContaining({
          settlementReason: "LATE_CLIENT_CANCELLATION",
          sessionOutcome: "",
        }),
      }),
      {
        idempotencyKey: "theraply-transfer-payment-id",
      },
    );
  });

  it("does not create a transfer for therapist-cancelled bookings", async () => {
    findBookingMock.mockResolvedValue(
      buildTransferBooking({
        bookingStatus: BookingStatus.CANCELLED,
        startsAt: new Date("2026-06-09T10:00:00Z"),
        cancelledAt: new Date("2026-06-09T08:30:00Z"),
        cancelledByUserId: "therapist-user-id",
        session: {
          id: "session-id",
          sessionStatus: SessionStatus.CANCELLED,
          outcome: null,
          completedAt: null,
        },
      }),
    );

    const result = await createTherapistTransferForBooking("booking-id", "therapist-user-id");

    expect(result).toEqual({
      status: "skipped",
      bookingId: "booking-id",
      paymentId: "payment-id",
      reason: "SESSION_NOT_SETTLED",
    });
    expect(transferCreateMock).not.toHaveBeenCalled();
  });
});
