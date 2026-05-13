import { BookingStatus, PaymentStatus, SessionStatus } from "@prisma/client";

export const CRON_BOOKING_RULES_JOB_NAME = "booking-rules";

export const CRON_BOOKING_RULES_ENDPOINT = "/api/cron/booking-rules";

export const CRON_BOOKING_RULES_FINAL_BOOKING_STATUSES = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.AUTO_CANCELLED,
  BookingStatus.COMPLETED,
] as const;

export const CRON_BOOKING_RULES_AUTO_CANCEL_CANDIDATE_BOOKING_STATUSES = [
  BookingStatus.CONFIRMED,
] as const;

export const CRON_BOOKING_RULES_AUTO_CANCEL_UNPAID_PAYMENT_STATUSES = [
  PaymentStatus.UNPAID,
  PaymentStatus.FAILED,
] as const;

export const CRON_BOOKING_RULES_PAYMENT_STATUSES_BLOCKING_AUTO_CANCEL = [
  PaymentStatus.PAID,
  PaymentStatus.REFUNDED,
] as const;

export const CRON_BOOKING_RULES_EXPIRED_CHECKOUT_PAYMENT_STATUSES = [
  PaymentStatus.PENDING,
] as const;

export const CRON_BOOKING_RULES_SESSION_CANCELLED_STATUS = SessionStatus.CANCELLED;

export const CRON_BOOKING_RULES_SYSTEM_ACTOR_ID = null;

export const CRON_BOOKING_RULES_AUTO_CANCEL_EMAIL_REASON =
  "Automatically cancelled because payment was not completed before the 24-hour deadline.";

export const CRON_BOOKING_RULES_AUDIT_ACTIONS = {
  runStarted: "CRON_BOOKING_RULES_RUN_STARTED",
  runCompleted: "CRON_BOOKING_RULES_RUN_COMPLETED",
  runFailed: "CRON_BOOKING_RULES_RUN_FAILED",
  bookingAutoCancelled: "SYSTEM_AUTO_CANCEL_UNPAID_BOOKING",
  bookingAutoCancelSkipped: "SYSTEM_AUTO_CANCEL_BOOKING_SKIPPED",
  googleCalendarDeleteFailed: "SYSTEM_AUTO_CANCEL_GOOGLE_CALENDAR_DELETE_FAILED",
  paymentCheckoutExpired: "SYSTEM_EXPIRE_STALE_CHECKOUT_PAYMENT",
  paymentCheckoutExpireSkipped: "SYSTEM_EXPIRE_STALE_CHECKOUT_PAYMENT_SKIPPED",
} as const;

export const CRON_BOOKING_RULES_AUTO_CANCEL_REASONS = {
  paymentDeadlinePassed: "PAYMENT_DEADLINE_PASSED",
} as const;

export const CRON_BOOKING_RULES_SKIP_REASONS = {
  alreadyFinal: "ALREADY_FINAL",
  paymentAlreadyPaid: "PAYMENT_ALREADY_PAID",
  paymentAlreadyRefunded: "PAYMENT_ALREADY_REFUNDED",
  paymentStillPending: "PAYMENT_STILL_PENDING",
  paymentDeadlineNotPassed: "PAYMENT_DEADLINE_NOT_PASSED",
  checkoutNotExpired: "CHECKOUT_NOT_EXPIRED",
} as const;

export const CRON_BOOKING_RULES_TRANSITIONS = {
  autoCancelUnpaidBooking: {
    fromBookingStatuses: CRON_BOOKING_RULES_AUTO_CANCEL_CANDIDATE_BOOKING_STATUSES,
    toBookingStatus: BookingStatus.AUTO_CANCELLED,
    toSessionStatus: CRON_BOOKING_RULES_SESSION_CANCELLED_STATUS,
    allowedPaymentStatuses: CRON_BOOKING_RULES_AUTO_CANCEL_UNPAID_PAYMENT_STATUSES,
    blockedPaymentStatuses: CRON_BOOKING_RULES_PAYMENT_STATUSES_BLOCKING_AUTO_CANCEL,
    auditAction: CRON_BOOKING_RULES_AUDIT_ACTIONS.bookingAutoCancelled,
    reason: CRON_BOOKING_RULES_AUTO_CANCEL_REASONS.paymentDeadlinePassed,
  },
  expireStaleCheckoutPayment: {
    fromPaymentStatuses: CRON_BOOKING_RULES_EXPIRED_CHECKOUT_PAYMENT_STATUSES,
    toPaymentStatus: PaymentStatus.FAILED,
    auditAction: CRON_BOOKING_RULES_AUDIT_ACTIONS.paymentCheckoutExpired,
  },
} as const;

export type CronBookingRulesAuditAction =
  (typeof CRON_BOOKING_RULES_AUDIT_ACTIONS)[keyof typeof CRON_BOOKING_RULES_AUDIT_ACTIONS];

export type CronBookingRulesAutoCancelReason =
  (typeof CRON_BOOKING_RULES_AUTO_CANCEL_REASONS)[keyof typeof CRON_BOOKING_RULES_AUTO_CANCEL_REASONS];

export type CronBookingRulesSkipReason =
  (typeof CRON_BOOKING_RULES_SKIP_REASONS)[keyof typeof CRON_BOOKING_RULES_SKIP_REASONS];
