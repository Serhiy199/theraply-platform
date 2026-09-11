import "server-only";

export const BOOKING_FEE_PENCE = 199;

export function resolveCheckoutBookingFee(
  payment: { bookingFeeAmount?: number } | null | undefined,
  currency: string,
) {
  if (currency.toLowerCase() !== "gbp") {
    throw new Error("Booking fees are supported only for GBP payments.");
  }
  // A retry must never pick up a changed global fee, including legacy zero-fee records.
  return payment ? payment.bookingFeeAmount ?? 0 : BOOKING_FEE_PENCE;
}
