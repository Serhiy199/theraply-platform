import { describe, expect, it } from "vitest";
import { calculatePaymentBreakdown } from "@/lib/payment-breakdown";
import { resolvePaymentFinancialSnapshot } from "@/lib/promo-code";
import { resolveCheckoutBookingFee } from "@/server/services/booking-fee-policy";
import { paymentCheckoutRequestSchema } from "@/lib/validations/payments";

describe("fixed booking fee", () => {
  it.each([
    [0, 0, 0, 8199, 800],
    [0, 2000, 2000, 6199, 800],
    [0, 8000, 8000, 199, 800],
    [0, 10000, 8000, 199, 800],
    [10, 0, 0, 7399, 0],
    [10, 10000, 7200, 199, 0],
  ])("keeps session and card-only fee separate: promo %i credit %i", (promo, credit, applied, stripe, platform) => {
    const b = calculatePaymentBreakdown({ grossAmount: 8000, promoDiscountPercent: promo, availableClientCredit: credit, bookingFeeAmount: 199 });
    expect(b).toMatchObject({ therapistAmount: 7200, platformFeeAmount: platform, bookingFeeAmount: 199, creditAppliedAmount: applied, stripeChargeAmount: stripe });
    expect(b.stripeChargeAmount + b.creditAppliedAmount).toBe(b.clientPayableAmount + 199);
    expect(b.platformFeeAmount + b.bookingFeeAmount).toBe(platform + 199);
  });

  it.each([0, 199, 299])("uses persisted fee %i, never the current global price", (fee) => {
    const b = calculatePaymentBreakdown({ grossAmount: 8000, bookingFeeAmount: fee });
    const snapshot = resolvePaymentFinancialSnapshot({ ...b, amount: 8000, currency: "gbp", promoCodeSnapshot: null, promoDiscountPercent: null });
    expect(snapshot.bookingFeeAmount).toBe(fee);
    expect(resolveCheckoutBookingFee({ bookingFeeAmount: fee }, "gbp")).toBe(fee);
  });

  it("assigns 199 only to new GBP payments", () => {
    expect(resolveCheckoutBookingFee(null, "gbp")).toBe(199);
    expect(resolveCheckoutBookingFee({}, "gbp")).toBe(0);
    expect(() => resolveCheckoutBookingFee(null, "usd")).toThrow();
  });

  it("does not accept frontend money inputs", () => {
    expect(paymentCheckoutRequestSchema.parse({ bookingId: "booking", amount: 1, bookingFeeAmount: 0, currency: "usd" })).toEqual({ bookingId: "booking" });
  });

  it("rejects invalid and incomplete fee snapshots", () => {
    expect(() => calculatePaymentBreakdown({ grossAmount: 8000, bookingFeeAmount: -1 })).toThrow();
    expect(() => resolvePaymentFinancialSnapshot({ amount: 8000, bookingFeeAmount: 199, therapistAmount: null, platformFeeAmount: null, creditAppliedAmount: null, promoCodeSnapshot: null, promoDiscountPercent: null, promoDiscountAmount: null, clientPayableAmount: null, stripeChargeAmount: null })).toThrow();
  });
});
