import { describe, expect, it } from "vitest";
import {
  getRemainingCardChargeDisplay,
  resolveClientPaymentDisplayBreakdown,
} from "@/lib/client-payment-presentation";
import type { PromoCodePreview } from "@/lib/contracts/payments";

const baseEligibility = {
  amount: 6000,
  projectedCreditAppliedAmount: 0,
  projectedStripeChargeAmount: 6000,
  currency: "gbp",
};

function promoPreview(creditAppliedAmount: number): PromoCodePreview {
  return {
    valid: true,
    normalizedCode: "ACCEPT5",
    discountPercent: 5,
    promoDiscountAmount: 300,
    grossAmount: 6000,
    clientPayableAmount: 5700,
    projectedCreditAppliedAmount: creditAppliedAmount,
    projectedStripeChargeAmount: 5700 - creditAppliedAmount,
    currency: "gbp",
  };
}

const frozenAccept5Payment = {
  amount: 6000,
  therapistAmount: 5400,
  platformFeeAmount: 300,
  creditAppliedAmount: 0,
  promoCodeSnapshot: "ACCEPT5",
  promoDiscountPercent: 5,
  promoDiscountAmount: 300,
  clientPayableAmount: 5700,
  stripeChargeAmount: 5700,
  paymentStatus: "PENDING",
  currency: "gbp",
};

describe("resolveClientPaymentDisplayBreakdown", () => {
  it.each([
    {
      name: "no promo and no credit",
      eligibility: baseEligibility,
      preview: null,
      expectedCardAmount: 6000,
    },
    {
      name: "ACCEPT5 and no credit",
      eligibility: baseEligibility,
      preview: promoPreview(0),
      expectedCardAmount: 5700,
    },
    {
      name: "ACCEPT5 and partial credit",
      eligibility: baseEligibility,
      preview: promoPreview(1000),
      expectedCardAmount: 4700,
    },
    {
      name: "ACCEPT5 and full credit",
      eligibility: baseEligibility,
      preview: promoPreview(5700),
      expectedCardAmount: 0,
    },
    {
      name: "no promo and partial credit",
      eligibility: {
        ...baseEligibility,
        projectedCreditAppliedAmount: 1000,
        projectedStripeChargeAmount: 5000,
      },
      preview: null,
      expectedCardAmount: 5000,
    },
  ])("uses the authoritative $name card amount", ({ eligibility, preview, expectedCardAmount }) => {
    const result = resolveClientPaymentDisplayBreakdown({
      payment: null,
      paymentEligibility: eligibility,
      promoPreview: preview,
    });

    expect(getRemainingCardChargeDisplay(result)).toEqual({
      amount: expectedCardAmount,
      currency: "gbp",
    });
  });

  it("keeps the frozen historical promo snapshot instead of a mutable preview", () => {
    const result = resolveClientPaymentDisplayBreakdown({
      payment: frozenAccept5Payment,
      paymentEligibility: baseEligibility,
      promoPreview: {
        ...promoPreview(0),
        normalizedCode: "OTHER10",
        discountPercent: 10,
        promoDiscountAmount: 600,
        clientPayableAmount: 5400,
        projectedStripeChargeAmount: 5400,
      },
    });

    expect(result).toMatchObject({
      promoCode: "ACCEPT5",
      clientPayableAmount: 5700,
      stripeChargeAmount: 5700,
    });
  });

  it("keeps the frozen card amount after the payment is paid", () => {
    const result = resolveClientPaymentDisplayBreakdown({
      payment: { ...frozenAccept5Payment, paymentStatus: "PAID" },
      paymentEligibility: { ...baseEligibility, projectedStripeChargeAmount: 6000 },
      promoPreview: null,
    });

    expect(result.stripeChargeAmount).toBe(5700);
  });
});
