import { PaymentStatus } from "@prisma/client";

export const PAYMENT_CURRENCY = "gbp" as const;
export const PAYMENT_POLICY_HOURS_BEFORE_SESSION = 24;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const PAYMENT_STATUS_BADGE_STYLES: Record<PaymentStatus, string> = {
  UNPAID: "bg-amber-100 text-amber-800 border-amber-200",
  PENDING: "bg-sky-100 text-sky-800 border-sky-200",
  PAID: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FAILED: "bg-rose-100 text-rose-800 border-rose-200",
  REFUNDED: "bg-slate-100 text-slate-700 border-slate-200",
};

export const PAYMENT_SUMMARY_MESSAGES = {
  clear: "No payment issues need attention right now.",
  attentionRequired: "One or more payments still need attention before the journey is fully settled.",
} as const;

export const PAYMENT_ELIGIBILITY_MESSAGES = {
  eligible: "Payment is ready. Complete checkout no later than 24 hours before the session starts.",
  bookingNotConfirmed:
    "Payment becomes available only after the therapist confirms the booking.",
  bookingClosed:
    "This booking is no longer payable because it has already reached a final state.",
  missingPrice:
    "Payment is temporarily unavailable because the therapist has not configured a session price yet.",
  alreadyPaid: "This session has already been paid.",
  paymentPending:
    "A payment attempt is already in progress for this session. Please finish it or wait for it to expire.",
  refunded:
    "This payment was refunded, so checkout is currently unavailable for this booking.",
  deadlinePassed:
    "The payment deadline has passed because sessions must be paid at least 24 hours before the start time.",
} as const;
