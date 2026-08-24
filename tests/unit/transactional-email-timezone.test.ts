import { BookingStatus, PaymentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildBookingCancelledEmail,
  buildBookingConfirmedEmail,
  buildBookingRejectedEmail,
  buildBookingRequestCreatedEmail,
  buildPaymentFailedEmail,
  buildPaymentSuccessfulEmail,
} from "@/lib/email/templates/transactional";

const bookingInput = {
  recipientName: "Client",
  clientName: "Client User",
  therapistName: "Therapist User",
  startsAt: new Date("2026-08-25T08:00:00.000Z"),
  endsAt: new Date("2026-08-25T09:00:00.000Z"),
  bookingStatus: BookingStatus.CONFIRMED,
  sessionUrl: "https://example.test/session",
};

describe("transactional email UK timezone policy", () => {
  it.each([
    ["booking request", () => buildBookingRequestCreatedEmail(bookingInput)],
    ["booking confirmation", () => buildBookingConfirmedEmail(bookingInput)],
    [
      "booking rejection",
      () => buildBookingRejectedEmail({ ...bookingInput, rejectionReason: "Unavailable" }),
    ],
    [
      "booking cancellation",
      () => buildBookingCancelledEmail({ ...bookingInput, cancellationReason: "Cancelled" }),
    ],
    [
      "payment success",
      () =>
        buildPaymentSuccessfulEmail({
          ...bookingInput,
          paymentStatus: PaymentStatus.PAID,
          amount: { amountMinor: 5700, currency: "GBP" },
        }),
    ],
    [
      "payment failure",
      () =>
        buildPaymentFailedEmail({
          ...bookingInput,
          paymentStatus: PaymentStatus.FAILED,
          amount: { amountMinor: 5700, currency: "GBP" },
        }),
    ],
  ])("renders %s session times in labelled UK time", (_name, buildEmail) => {
    const email = buildEmail();

    expect(email.text).toContain("25 Aug 2026, 09:00 (UK time)");
    expect(email.text).toContain("25 Aug 2026, 10:00 (UK time)");
    expect(email.html).toContain("25 Aug 2026, 09:00 (UK time)");
    expect(email.text).not.toContain("11:00");
  });
});
