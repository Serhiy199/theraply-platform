import { PaymentStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPaymentSuccessfulEmailBestEffort } from "@/server/services/transactional-email-events.service";

const findBookingMock = vi.hoisted(() => vi.fn());
const sendTransactionalEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: findBookingMock,
    },
  },
}));

vi.mock("@/server/services/email-delivery.service", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  logDiagnosticEvent: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://app.example");
  sendTransactionalEmailMock.mockResolvedValue({});
  findBookingMock.mockResolvedValue({
    id: "booking-id",
    startsAt: new Date("2026-09-02T09:00:00Z"),
    endsAt: new Date("2026-09-02T10:00:00Z"),
    bookingStatus: "CONFIRMED",
    notes: null,
    cancelledByUserId: null,
    client: {
      id: "client-id",
      email: "client@example.com",
      firstName: "Client",
      lastName: "User",
    },
    therapist: {
      id: "therapist-id",
      email: "therapist@example.com",
      firstName: "Therapist",
      lastName: "User",
      therapistProfile: { displayName: "Therapist User" },
    },
    cancelledBy: null,
    session: null,
    payment: {
      id: "payment-id",
      amount: 6000,
      clientPayableAmount: 5700,
      currency: "gbp",
      paymentStatus: PaymentStatus.PAID,
      failedReason: null,
    },
  });
});

describe("payment success email event", () => {
  it("uses the Payment idempotency key and frozen client payable amount", async () => {
    await sendPaymentSuccessfulEmailBestEffort("booking-id");

    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "payment-success:payment-id",
        template: "PAYMENT_SUCCESSFUL",
        text: expect.stringContaining("£57.00"),
      }),
    );
  });
});
