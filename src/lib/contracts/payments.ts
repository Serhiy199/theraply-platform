export type PromoCodePreview = {
  valid: true;
  normalizedCode: string;
  discountPercent: number;
  promoDiscountAmount: number;
  grossAmount: number;
  clientPayableAmount: number;
  projectedCreditAppliedAmount: number;
  projectedStripeChargeAmount: number;
  currency: string;
};
