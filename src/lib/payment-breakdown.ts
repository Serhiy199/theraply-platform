import {
  PLATFORM_FEE_PERCENT,
  THERAPIST_SHARE_PERCENT,
} from "@/lib/constants/payments";

export type PaymentBreakdownInput = {
  grossAmount: number;
  promoDiscountPercent?: number;
  availableClientCredit?: number;
};

export type PaymentBreakdown = {
  grossAmount: number;
  therapistAmount: number;
  basePlatformFeeAmount: number;
  promoDiscountPercent: number;
  promoDiscountAmount: number;
  clientPayableAmount: number;
  creditAppliedAmount: number;
  stripeChargeAmount: number;
  platformFeeAmount: number;
};

function assertNonNegativeMoney(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer amount in pence.`);
  }
}

export function calculatePaymentBreakdown({
  grossAmount,
  promoDiscountPercent = 0,
  availableClientCredit = 0,
}: PaymentBreakdownInput): PaymentBreakdown {
  assertNonNegativeMoney(grossAmount, "grossAmount");
  assertNonNegativeMoney(availableClientCredit, "availableClientCredit");

  if (
    !Number.isInteger(promoDiscountPercent) ||
    promoDiscountPercent < 0 ||
    promoDiscountPercent > PLATFORM_FEE_PERCENT
  ) {
    throw new RangeError(
      `promoDiscountPercent must be an integer from 0 to ${PLATFORM_FEE_PERCENT}.`,
    );
  }

  const therapistAmount = Math.round(
    (grossAmount * THERAPIST_SHARE_PERCENT) / 100,
  );
  const basePlatformFeeAmount = grossAmount - therapistAmount;
  const promoDiscountAmount = Math.min(
    Math.round((grossAmount * promoDiscountPercent) / 100),
    basePlatformFeeAmount,
  );
  const clientPayableAmount = grossAmount - promoDiscountAmount;
  const creditAppliedAmount = Math.min(availableClientCredit, clientPayableAmount);
  const stripeChargeAmount = clientPayableAmount - creditAppliedAmount;
  const platformFeeAmount = basePlatformFeeAmount - promoDiscountAmount;

  if (
    therapistAmount + platformFeeAmount !== clientPayableAmount ||
    stripeChargeAmount + creditAppliedAmount !== clientPayableAmount ||
    promoDiscountAmount > basePlatformFeeAmount ||
    platformFeeAmount < 0 ||
    stripeChargeAmount < 0
  ) {
    throw new Error("Payment breakdown invariants were not satisfied.");
  }

  return {
    grossAmount,
    therapistAmount,
    basePlatformFeeAmount,
    promoDiscountPercent,
    promoDiscountAmount,
    clientPayableAmount,
    creditAppliedAmount,
    stripeChargeAmount,
    platformFeeAmount,
  };
}
