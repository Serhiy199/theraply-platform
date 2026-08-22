import { describe, expect, it } from "vitest";
import { calculatePaymentBreakdown } from "@/lib/payment-breakdown";

const grossAmounts = [4999, 4995, 5800, 6000, 8000, 10000];
const promoDiscounts = [0, 1, 5, 10];

describe("calculatePaymentBreakdown", () => {
  it.each(grossAmounts)("keeps exact invariants for gross %ip", (grossAmount) => {
    for (const promoDiscountPercent of promoDiscounts) {
      const result = calculatePaymentBreakdown({
        grossAmount,
        promoDiscountPercent,
        availableClientCredit: 1234,
      });

      expect(result.therapistAmount + result.platformFeeAmount).toBe(
        result.clientPayableAmount,
      );
      expect(result.stripeChargeAmount + result.creditAppliedAmount).toBe(
        result.clientPayableAmount,
      );
      expect(result.promoDiscountAmount).toBeLessThanOrEqual(
        result.basePlatformFeeAmount,
      );
      expect(result.platformFeeAmount).toBeGreaterThanOrEqual(0);
      expect(result.stripeChargeAmount).toBeGreaterThanOrEqual(0);
      expect(result.therapistAmount).toBe(Math.round((grossAmount * 90) / 100));
    }
  });

  it("derives the platform share instead of independently rounding 10 percent", () => {
    const result = calculatePaymentBreakdown({ grossAmount: 4995 });

    expect(result.therapistAmount).toBe(4496);
    expect(result.basePlatformFeeAmount).toBe(499);
    expect(result.therapistAmount + result.basePlatformFeeAmount).toBe(4995);
  });

  it.each([
    { credit: 0, applied: 0, stripe: 10000 },
    { credit: 2500, applied: 2500, stripe: 7500 },
    { credit: 10000, applied: 10000, stripe: 0 },
    { credit: 12000, applied: 10000, stripe: 0 },
  ])("caps client credit safely for %#", ({ credit, applied, stripe }) => {
    const result = calculatePaymentBreakdown({
      grossAmount: 10000,
      availableClientCredit: credit,
    });

    expect(result.creditAppliedAmount).toBe(applied);
    expect(result.stripeChargeAmount).toBe(stripe);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid money amount %s",
    (grossAmount) => {
      expect(() => calculatePaymentBreakdown({ grossAmount })).toThrow(RangeError);
    },
  );

  it.each([-1, 0.5, 11])("rejects invalid promo percentage %s", (promoDiscountPercent) => {
    expect(() =>
      calculatePaymentBreakdown({ grossAmount: 10000, promoDiscountPercent }),
    ).toThrow(RangeError);
  });
});
