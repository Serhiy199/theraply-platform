import { describe, expect, it } from "vitest";
import { buildPaymentSuccessfulEmail } from "@/lib/email/templates/transactional";

describe("booking fee payment email", () => {
  it("separates the session, credit and non-refundable card-only fee", () => {
    const output = buildPaymentSuccessfulEmail({
      amount: { amountMinor: 8000, currency: "gbp" },
      bookingFee: { amountMinor: 199, currency: "gbp" },
      creditApplied: { amountMinor: 8000, currency: "gbp" },
      cardAmount: { amountMinor: 199, currency: "gbp" },
    });
    expect(output.text).toContain("Session after promo: £80.00");
    expect(output.text).toContain("Booking fee (non-refundable): £1.99");
    expect(output.text).toContain("Client credit: £80.00");
    expect(output.text).toContain("Card amount: £1.99");
  });

  it("does not invent a fee for a historical payment", () => {
    const output = buildPaymentSuccessfulEmail({ amount: { amountMinor: 8000, currency: "gbp" } });
    expect(output.text).toContain("Amount: £80.00");
    expect(output.text).not.toContain("£1.99");
  });
});
