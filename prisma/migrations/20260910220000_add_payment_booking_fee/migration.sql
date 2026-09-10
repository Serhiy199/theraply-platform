-- Existing payments retain their original pricing and refund policy.
ALTER TABLE "Payment" ADD COLUMN "bookingFeeAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingFeeAmount_nonnegative"
CHECK ("bookingFeeAmount" >= 0);
