import { PaymentStatus } from "@prisma/client";

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
