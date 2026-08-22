import {
  calculatePaymentBreakdown,
  type PaymentBreakdown,
} from "@/lib/payment-breakdown";

export const PROMO_CODE_MIN_LENGTH = 3;
export const PROMO_CODE_MAX_LENGTH = 32;
export const PROMO_DISCOUNT_MIN_PERCENT = 1;
export const PROMO_DISCOUNT_MAX_PERCENT = 10;

const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export type PromoCodeDefinition = {
  id: string;
  code: string;
  discountPercent: number;
  isActive: boolean;
  expiresAt: Date | null;
};

export type PromoCodeLifecycleStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export type PromoPaymentSnapshot = Readonly<{
  promoCodeId: string;
  promoCodeSnapshot: string;
  promoDiscountPercent: number;
  promoDiscountAmount: number;
  clientPayableAmount: number;
  stripeChargeAmount: number;
  therapistAmount: number;
  platformFeeAmount: number;
  creditAppliedAmount: number;
}>;

export type PaymentFinancialSnapshotSource = {
  amount: number;
  therapistAmount: number | null;
  platformFeeAmount: number | null;
  creditAppliedAmount: number | null;
  promoCodeSnapshot: string | null;
  promoDiscountPercent: number | null;
  promoDiscountAmount: number | null;
  clientPayableAmount: number | null;
  stripeChargeAmount: number | null;
};

export type ResolvedPaymentFinancialSnapshot = Readonly<
  PaymentBreakdown & {
    promoCodeSnapshot: string | null;
  }
>;

export class PromoCodeValidationError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CODE"
      | "INVALID_DISCOUNT"
      | "INVALID_EXPIRY"
      | "INACTIVE"
      | "EXPIRED"
      | "INCOMPLETE_PAYMENT_SNAPSHOT",
    message: string,
  ) {
    super(message);
    this.name = "PromoCodeValidationError";
  }
}

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

export function validatePromoCodeFormat(code: string): string {
  const normalizedCode = normalizePromoCode(code);

  if (!PROMO_CODE_PATTERN.test(normalizedCode)) {
    throw new PromoCodeValidationError(
      "INVALID_CODE",
      `Promo code must be ${PROMO_CODE_MIN_LENGTH}-${PROMO_CODE_MAX_LENGTH} characters and contain only A-Z, 0-9, hyphen, or underscore.`,
    );
  }

  return normalizedCode;
}

export function validatePromoDiscountPercent(discountPercent: number): number {
  if (
    !Number.isInteger(discountPercent) ||
    discountPercent < PROMO_DISCOUNT_MIN_PERCENT ||
    discountPercent > PROMO_DISCOUNT_MAX_PERCENT
  ) {
    throw new PromoCodeValidationError(
      "INVALID_DISCOUNT",
      `Promo discount must be an integer from ${PROMO_DISCOUNT_MIN_PERCENT} to ${PROMO_DISCOUNT_MAX_PERCENT}.`,
    );
  }

  return discountPercent;
}

export function validatePromoCodeInput({
  code,
  discountPercent,
  expiresAt = null,
}: {
  code: string;
  discountPercent: number;
  expiresAt?: Date | null;
}): {
  code: string;
  discountPercent: number;
  expiresAt: Date | null;
} {
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new PromoCodeValidationError(
      "INVALID_EXPIRY",
      "Promo code expiry is invalid.",
    );
  }

  return {
    code: validatePromoCodeFormat(code),
    discountPercent: validatePromoDiscountPercent(discountPercent),
    expiresAt,
  };
}

export function assertPromoCodeUsable(
  promoCode: Pick<PromoCodeDefinition, "isActive" | "expiresAt">,
  now: Date = new Date(),
): void {
  if (!promoCode.isActive) {
    throw new PromoCodeValidationError("INACTIVE", "Promo code is inactive.");
  }

  if (Number.isNaN(now.getTime())) {
    throw new PromoCodeValidationError("INVALID_EXPIRY", "Current time is invalid.");
  }

  if (promoCode.expiresAt) {
    if (Number.isNaN(promoCode.expiresAt.getTime())) {
      throw new PromoCodeValidationError(
        "INVALID_EXPIRY",
        "Promo code expiry is invalid.",
      );
    }

    if (now.getTime() >= promoCode.expiresAt.getTime()) {
      throw new PromoCodeValidationError("EXPIRED", "Promo code has expired.");
    }
  }
}

export function isPromoCodeCurrentlyValid(
  promoCode: Pick<PromoCodeDefinition, "isActive" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  try {
    assertPromoCodeUsable(promoCode, now);
    return true;
  } catch (error) {
    if (error instanceof PromoCodeValidationError) {
      return false;
    }

    throw error;
  }
}

export function getPromoCodeLifecycleStatus(
  promoCode: Pick<PromoCodeDefinition, "isActive" | "expiresAt">,
  now: Date = new Date(),
): PromoCodeLifecycleStatus {
  if (!promoCode.isActive) {
    return "INACTIVE";
  }

  if (promoCode.expiresAt && now.getTime() >= promoCode.expiresAt.getTime()) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

export function buildPromoPaymentSnapshot({
  grossAmount,
  promoCode,
  availableClientCredit = 0,
  now = new Date(),
}: {
  grossAmount: number;
  promoCode: PromoCodeDefinition;
  availableClientCredit?: number;
  now?: Date;
}): PromoPaymentSnapshot {
  const promoCodeSnapshot = validatePromoCodeFormat(promoCode.code);
  const promoDiscountPercent = validatePromoDiscountPercent(
    promoCode.discountPercent,
  );
  assertPromoCodeUsable(promoCode, now);

  const breakdown = calculatePaymentBreakdown({
    grossAmount,
    promoDiscountPercent,
    availableClientCredit,
  });

  return Object.freeze({
    promoCodeId: promoCode.id,
    promoCodeSnapshot,
    promoDiscountPercent,
    promoDiscountAmount: breakdown.promoDiscountAmount,
    clientPayableAmount: breakdown.clientPayableAmount,
    stripeChargeAmount: breakdown.stripeChargeAmount,
    therapistAmount: breakdown.therapistAmount,
    platformFeeAmount: breakdown.platformFeeAmount,
    creditAppliedAmount: breakdown.creditAppliedAmount,
  });
}

export function resolvePaymentFinancialSnapshot(
  payment: PaymentFinancialSnapshotSource,
): ResolvedPaymentFinancialSnapshot {
  const financialSnapshotValues = [
    payment.promoDiscountAmount,
    payment.clientPayableAmount,
    payment.stripeChargeAmount,
  ];
  const hasSnapshotValue =
    payment.promoCodeSnapshot !== null ||
    payment.promoDiscountPercent !== null ||
    financialSnapshotValues.some((value) => value !== null);
  const hasCompleteNumericSnapshot = financialSnapshotValues.every(
    (value) => value !== null,
  ) && (payment.promoCodeSnapshot === null || payment.promoDiscountPercent !== null);

  if (hasSnapshotValue && !hasCompleteNumericSnapshot) {
    throw new PromoCodeValidationError(
      "INCOMPLETE_PAYMENT_SNAPSHOT",
      "Payment promo snapshot is incomplete.",
    );
  }

  if (hasCompleteNumericSnapshot) {
    const discountPercent = payment.promoDiscountPercent ?? 0;
    const discountAmount = payment.promoDiscountAmount!;

    if (payment.promoCodeSnapshot) {
      validatePromoCodeFormat(payment.promoCodeSnapshot);
      validatePromoDiscountPercent(discountPercent);
    } else if (
      (payment.promoDiscountPercent !== null && discountPercent !== 0) ||
      discountAmount !== 0
    ) {
      throw new PromoCodeValidationError(
        "INCOMPLETE_PAYMENT_SNAPSHOT",
        "Payment promo identity is missing from a discounted snapshot.",
      );
    }
  }

  const calculated = calculatePaymentBreakdown({
    grossAmount: payment.amount,
    promoDiscountPercent: payment.promoDiscountPercent ?? 0,
    availableClientCredit: payment.creditAppliedAmount ?? 0,
  });

  if (!hasCompleteNumericSnapshot) {
    return Object.freeze({
      ...calculated,
      therapistAmount: payment.therapistAmount ?? calculated.therapistAmount,
      platformFeeAmount:
        payment.platformFeeAmount ?? calculated.platformFeeAmount,
      promoCodeSnapshot: null,
    });
  }

  if (
    payment.promoDiscountAmount !== calculated.promoDiscountAmount ||
    payment.clientPayableAmount !== calculated.clientPayableAmount ||
    payment.stripeChargeAmount !== calculated.stripeChargeAmount ||
    (payment.therapistAmount !== null &&
      payment.therapistAmount !== calculated.therapistAmount) ||
    (payment.platformFeeAmount !== null &&
      payment.platformFeeAmount !== calculated.platformFeeAmount)
  ) {
    throw new PromoCodeValidationError(
      "INCOMPLETE_PAYMENT_SNAPSHOT",
      "Payment financial snapshot does not match the canonical breakdown.",
    );
  }

  return Object.freeze({
    ...calculated,
    promoCodeSnapshot: payment.promoCodeSnapshot,
  });
}
