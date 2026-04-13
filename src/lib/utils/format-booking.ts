import { BookingStatus, PaymentStatus } from "@prisma/client";
import {
  BOOKING_STATUS_BADGE_STYLES,
  BOOKING_STATUS_LABELS,
  CANCELLATION_POLICY_HOURS,
  CANCELLATION_POLICY_MESSAGES,
} from "@/lib/constants/bookings";
import { PAYMENT_STATUS_BADGE_STYLES, PAYMENT_STATUS_LABELS } from "@/lib/constants/payments";

export function formatBookingStatus(status: BookingStatus) {
  return BOOKING_STATUS_LABELS[status];
}

export function getBookingStatusBadgeClass(status: BookingStatus) {
  return BOOKING_STATUS_BADGE_STYLES[status];
}

export function formatPaymentStatus(status: PaymentStatus) {
  return PAYMENT_STATUS_LABELS[status];
}

export function getPaymentStatusBadgeClass(status: PaymentStatus) {
  return PAYMENT_STATUS_BADGE_STYLES[status];
}

export function isLateCancellation(startsAt: Date, now = new Date()) {
  return startsAt.getTime() - now.getTime() < CANCELLATION_POLICY_HOURS * 60 * 60 * 1000;
}

export function getCancellationPolicyMessage(startsAt: Date, now = new Date()) {
  return isLateCancellation(startsAt, now)
    ? CANCELLATION_POLICY_MESSAGES.late
    : CANCELLATION_POLICY_MESSAGES.standard;
}
