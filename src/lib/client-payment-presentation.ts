import type { PromoCodePreview } from "@/lib/contracts/payments";
import {
  resolvePaymentFinancialSnapshot,
  type PaymentFinancialSnapshotSource,
} from "@/lib/promo-code";

type PaymentDisplaySource = PaymentFinancialSnapshotSource & {
  paymentStatus: string;
  currency: string;
};

type PaymentEligibilityDisplaySource = {
  amount: number | null;
  projectedCreditAppliedAmount: number;
  projectedStripeChargeAmount: number | null;
  currency: string;
};

export type ClientPaymentDisplayBreakdown = {
  grossAmount: number | null;
  promoCode: string | null;
  promoDiscountAmount: number;
  clientPayableAmount: number | null;
  creditAppliedAmount: number;
  stripeChargeAmount: number | null;
  currency: string;
};

export function hasFrozenPaymentFinancials(
  payment: PaymentDisplaySource | null | undefined,
) {
  return (
    payment?.paymentStatus === "PENDING" ||
    payment?.paymentStatus === "PAID" ||
    payment?.paymentStatus === "REFUNDED"
  );
}

export function resolveClientPaymentDisplayBreakdown({
  payment,
  paymentEligibility,
  promoPreview,
}: {
  payment: PaymentDisplaySource | null | undefined;
  paymentEligibility: PaymentEligibilityDisplaySource;
  promoPreview: PromoCodePreview | null;
}): ClientPaymentDisplayBreakdown {
  if (hasFrozenPaymentFinancials(payment) && payment) {
    try {
      const snapshot = resolvePaymentFinancialSnapshot(payment);

      return {
        grossAmount: snapshot.grossAmount,
        promoCode: snapshot.promoCodeSnapshot,
        promoDiscountAmount: snapshot.promoDiscountAmount,
        clientPayableAmount: snapshot.clientPayableAmount,
        creditAppliedAmount: snapshot.creditAppliedAmount,
        stripeChargeAmount: snapshot.stripeChargeAmount,
        currency: payment.currency,
      };
    } catch {
      // Preserve the existing safe fallback for legacy incomplete records.
    }
  }

  if (promoPreview) {
    return {
      grossAmount: promoPreview.grossAmount,
      promoCode: promoPreview.normalizedCode,
      promoDiscountAmount: promoPreview.promoDiscountAmount,
      clientPayableAmount: promoPreview.clientPayableAmount,
      creditAppliedAmount: promoPreview.projectedCreditAppliedAmount,
      stripeChargeAmount: promoPreview.projectedStripeChargeAmount,
      currency: promoPreview.currency,
    };
  }

  return {
    grossAmount: paymentEligibility.amount,
    promoCode: null,
    promoDiscountAmount: 0,
    clientPayableAmount: paymentEligibility.amount,
    creditAppliedAmount: paymentEligibility.projectedCreditAppliedAmount,
    stripeChargeAmount: paymentEligibility.projectedStripeChargeAmount,
    currency: paymentEligibility.currency,
  };
}

export function getRemainingCardChargeDisplay(
  breakdown: ClientPaymentDisplayBreakdown,
) {
  return {
    amount: breakdown.stripeChargeAmount,
    currency: breakdown.currency,
  };
}
