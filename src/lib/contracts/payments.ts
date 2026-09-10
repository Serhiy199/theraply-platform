export type PromoCodePreview = {
  bookingFeeAmount: number;
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
