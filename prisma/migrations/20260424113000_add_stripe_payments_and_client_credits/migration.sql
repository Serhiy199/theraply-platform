-- CreateEnum
CREATE TYPE "public"."CompensationResolutionType" AS ENUM ('REFUND', 'CREDIT');

-- CreateEnum
CREATE TYPE "public"."ClientCreditTransactionType" AS ENUM ('ISSUED', 'APPLIED', 'REVERSED', 'EXPIRED');

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "compensationResolutionType" "public"."CompensationResolutionType",
ADD COLUMN     "compensationResolvedAt" TIMESTAMP(3),
ADD COLUMN     "paymentDueBy" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "checkoutExpiresAt" TIMESTAMP(3),
ADD COLUMN     "creditAppliedAmount" INTEGER,
ADD COLUMN     "failedReason" TEXT,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAmount" INTEGER,
ADD COLUMN     "stripeRefundId" TEXT,
ALTER COLUMN "currency" SET DEFAULT 'gbp';

-- AlterTable
ALTER TABLE "public"."TherapistProfile" ADD COLUMN     "sessionPricePence" INTEGER;

-- CreateTable
CREATE TABLE "public"."ClientCreditBalance" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'gbp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientCreditTransaction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "bookingId" TEXT,
    "paymentId" TEXT,
    "type" "public"."ClientCreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'gbp',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientCreditBalance_clientId_key" ON "public"."ClientCreditBalance"("clientId");

-- CreateIndex
CREATE INDEX "ClientCreditBalance_currency_idx" ON "public"."ClientCreditBalance"("currency");

-- CreateIndex
CREATE INDEX "ClientCreditBalance_updatedAt_idx" ON "public"."ClientCreditBalance"("updatedAt");

-- CreateIndex
CREATE INDEX "ClientCreditTransaction_clientId_idx" ON "public"."ClientCreditTransaction"("clientId");

-- CreateIndex
CREATE INDEX "ClientCreditTransaction_bookingId_idx" ON "public"."ClientCreditTransaction"("bookingId");

-- CreateIndex
CREATE INDEX "ClientCreditTransaction_paymentId_idx" ON "public"."ClientCreditTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "ClientCreditTransaction_type_idx" ON "public"."ClientCreditTransaction"("type");

-- CreateIndex
CREATE INDEX "ClientCreditTransaction_createdAt_idx" ON "public"."ClientCreditTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "ClientCreditTransaction_clientId_createdAt_idx" ON "public"."ClientCreditTransaction"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_paymentDueBy_idx" ON "public"."Booking"("paymentDueBy");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeRefundId_key" ON "public"."Payment"("stripeRefundId");

-- CreateIndex
CREATE INDEX "Payment_checkoutExpiresAt_idx" ON "public"."Payment"("checkoutExpiresAt");

-- CreateIndex
CREATE INDEX "TherapistProfile_sessionPricePence_idx" ON "public"."TherapistProfile"("sessionPricePence");

-- AddForeignKey
ALTER TABLE "public"."ClientCreditBalance" ADD CONSTRAINT "ClientCreditBalance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientCreditTransaction" ADD CONSTRAINT "ClientCreditTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientCreditTransaction" ADD CONSTRAINT "ClientCreditTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientCreditTransaction" ADD CONSTRAINT "ClientCreditTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
