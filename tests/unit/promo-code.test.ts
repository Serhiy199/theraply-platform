import { describe, expect, it } from "vitest";
import {
  assertPromoCodeUsable,
  buildPromoPaymentSnapshot,
  getPromoCodeLifecycleStatus,
  isPromoCodeCurrentlyValid,
  normalizePromoCode,
  PromoCodeValidationError,
  resolvePaymentFinancialSnapshot,
  validatePromoCodeFormat,
  validatePromoCodeInput,
  validatePromoDiscountPercent,
} from "@/lib/promo-code";

describe("promo code domain", () => {
  it.each(["SAVE5", "save5", " Save5 "])(
    "normalizes %s to the canonical code",
    (code) => {
      expect(normalizePromoCode(code)).toBe("SAVE5");
      expect(validatePromoCodeFormat(code)).toBe("SAVE5");
    },
  );

  it.each(["SAVE5", "WELCOME-5", "SUMMER_5"])(
    "accepts valid code %s",
    (code) => {
      expect(validatePromoCodeFormat(code)).toBe(code);
    },
  );

  it.each(["", "   ", "AB", "A".repeat(33), "SAVE 5", "SAVE.5", "SAVE🎁"])(
    "rejects invalid code %s",
    (code) => {
      expect(() => validatePromoCodeFormat(code)).toThrow(
        PromoCodeValidationError,
      );
    },
  );

  it.each([1, 5, 10])("accepts discount %i", (discountPercent) => {
    expect(validatePromoDiscountPercent(discountPercent)).toBe(discountPercent);
  });

  it.each([0, 1.5, 11])("rejects discount %s", (discountPercent) => {
    expect(() => validatePromoDiscountPercent(discountPercent)).toThrow(
      PromoCodeValidationError,
    );
  });

  it("validates and returns canonical persistence input", () => {
    expect(
      validatePromoCodeInput({
        code: " welcome-5 ",
        discountPercent: 5,
        expiresAt: null,
      }),
    ).toEqual({
      code: "WELCOME-5",
      discountPercent: 5,
      expiresAt: null,
    });
  });

  it("accepts no expiry and a future UTC expiry", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");

    expect(
      isPromoCodeCurrentlyValid({ isActive: true, expiresAt: null }, now),
    ).toBe(true);
    expect(
      isPromoCodeCurrentlyValid(
        { isActive: true, expiresAt: new Date("2026-08-22T12:00:00.001Z") },
        now,
      ),
    ).toBe(true);
  });

  it("rejects inactive, expired, and expiry-boundary codes", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");

    expect(() =>
      assertPromoCodeUsable({ isActive: false, expiresAt: null }, now),
    ).toThrowError(expect.objectContaining({ code: "INACTIVE" }));
    expect(() =>
      assertPromoCodeUsable(
        { isActive: true, expiresAt: new Date("2026-08-22T11:59:59.999Z") },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: "EXPIRED" }));
    expect(() =>
      assertPromoCodeUsable(
        { isActive: true, expiresAt: new Date("2026-08-22T12:00:00.000Z") },
        now,
      ),
    ).toThrowError(expect.objectContaining({ code: "EXPIRED" }));
  });

  it("computes ACTIVE, INACTIVE, and EXPIRED lifecycle states", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");

    expect(
      getPromoCodeLifecycleStatus({ isActive: true, expiresAt: null }, now),
    ).toBe("ACTIVE");
    expect(
      getPromoCodeLifecycleStatus(
        { isActive: false, expiresAt: new Date("2026-08-23T12:00:00.000Z") },
        now,
      ),
    ).toBe("INACTIVE");
    expect(
      getPromoCodeLifecycleStatus(
        { isActive: true, expiresAt: new Date("2026-08-22T12:00:00.000Z") },
        now,
      ),
    ).toBe("EXPIRED");
  });

  it.each([
    {
      grossAmount: 10000,
      discountPercent: 1,
      discountAmount: 100,
      clientPayableAmount: 9900,
      therapistAmount: 9000,
      platformFeeAmount: 900,
    },
    {
      grossAmount: 4995,
      discountPercent: 5,
      discountAmount: 250,
      clientPayableAmount: 4745,
      therapistAmount: 4496,
      platformFeeAmount: 249,
    },
    {
      grossAmount: 10000,
      discountPercent: 10,
      discountAmount: 1000,
      clientPayableAmount: 9000,
      therapistAmount: 9000,
      platformFeeAmount: 0,
    },
  ])("builds immutable platform-funded snapshot for %#", (expected) => {
    const snapshot = buildPromoPaymentSnapshot({
      grossAmount: expected.grossAmount,
      promoCode: {
        id: "promo-id",
        code: " save5 ",
        discountPercent: expected.discountPercent,
        isActive: true,
        expiresAt: null,
      },
    });

    expect(snapshot).toMatchObject({
      promoCodeId: "promo-id",
      promoCodeSnapshot: "SAVE5",
      promoDiscountPercent: expected.discountPercent,
      promoDiscountAmount: expected.discountAmount,
      clientPayableAmount: expected.clientPayableAmount,
      stripeChargeAmount: expected.clientPayableAmount,
      therapistAmount: expected.therapistAmount,
      platformFeeAmount: expected.platformFeeAmount,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it.each([
    { availableClientCredit: 2000, applied: 2000, stripe: 7500 },
    { availableClientCredit: 9500, applied: 9500, stripe: 0 },
    { availableClientCredit: 12000, applied: 9500, stripe: 0 },
  ])("combines promo with client credit for %#", (credit) => {
    const snapshot = buildPromoPaymentSnapshot({
      grossAmount: 10000,
      availableClientCredit: credit.availableClientCredit,
      promoCode: {
        id: "promo-id",
        code: "SAVE5",
        discountPercent: 5,
        isActive: true,
        expiresAt: null,
      },
    });

    expect(snapshot).toMatchObject({
      promoDiscountAmount: 500,
      clientPayableAmount: 9500,
      creditAppliedAmount: credit.applied,
      stripeChargeAmount: credit.stripe,
      therapistAmount: 9000,
      platformFeeAmount: 500,
    });
  });

  it("resolves legacy rows without promo snapshot fields", () => {
    const resolved = resolvePaymentFinancialSnapshot({
      amount: 4995,
      therapistAmount: null,
      platformFeeAmount: null,
      creditAppliedAmount: 500,
      promoCodeSnapshot: null,
      promoDiscountPercent: null,
      promoDiscountAmount: null,
      clientPayableAmount: null,
      stripeChargeAmount: null,
    });

    expect(resolved).toMatchObject({
      grossAmount: 4995,
      promoCodeSnapshot: null,
      promoDiscountPercent: 0,
      promoDiscountAmount: 0,
      clientPayableAmount: 4995,
      creditAppliedAmount: 500,
      stripeChargeAmount: 4495,
      therapistAmount: 4496,
      platformFeeAmount: 499,
    });
  });

  it("fails closed for a partial stored promo snapshot", () => {
    expect(() =>
      resolvePaymentFinancialSnapshot({
        amount: 5000,
        therapistAmount: 4500,
        platformFeeAmount: 250,
        creditAppliedAmount: 0,
        promoCodeSnapshot: "SAVE5",
        promoDiscountPercent: 5,
        promoDiscountAmount: null,
        clientPayableAmount: null,
        stripeChargeAmount: null,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INCOMPLETE_PAYMENT_SNAPSHOT" }),
    );
  });

  it("accepts a complete modern no-promo snapshot", () => {
    expect(
      resolvePaymentFinancialSnapshot({
        amount: 10000,
        therapistAmount: 9000,
        platformFeeAmount: 1000,
        creditAppliedAmount: 2000,
        promoCodeSnapshot: null,
        promoDiscountPercent: 0,
        promoDiscountAmount: 0,
        clientPayableAmount: 10000,
        stripeChargeAmount: 8000,
      }),
    ).toMatchObject({
      promoCodeSnapshot: null,
      promoDiscountAmount: 0,
      clientPayableAmount: 10000,
      stripeChargeAmount: 8000,
    });
  });

  it("fails closed when stored promo arithmetic differs from canonical values", () => {
    expect(() =>
      resolvePaymentFinancialSnapshot({
        amount: 10000,
        therapistAmount: 9000,
        platformFeeAmount: 500,
        creditAppliedAmount: 2000,
        promoCodeSnapshot: "SAVE5",
        promoDiscountPercent: 5,
        promoDiscountAmount: 501,
        clientPayableAmount: 9499,
        stripeChargeAmount: 7499,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INCOMPLETE_PAYMENT_SNAPSHOT" }),
    );
  });
});
