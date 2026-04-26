import { BookingStatus } from "@prisma/client";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_THERAPIST: "Pending therapist",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  AUTO_CANCELLED: "Auto-cancelled",
  COMPLETED: "Completed",
};

export const BOOKING_STATUS_BADGE_STYLES: Record<BookingStatus, string> = {
  PENDING_THERAPIST: "bg-amber-100 text-amber-800 border-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 border-rose-200",
  CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
  AUTO_CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
  COMPLETED: "bg-sky-100 text-sky-800 border-sky-200",
};

export const CANCELLATION_POLICY_HOURS = 24;

export const CANCELLATION_POLICY_MESSAGES = {
  standard:
    "Cancellations made at least 24 hours before the session are treated as standard cancellations. If the session was already paid, the platform can process a refund under the normal policy.",
  late:
    "Cancellations made less than 24 hours before the session are treated as late cancellations. When payment has already been captured, the booked time is considered non-refundable under platform policy.",
} as const;
