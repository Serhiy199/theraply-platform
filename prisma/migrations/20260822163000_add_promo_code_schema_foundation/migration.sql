CREATE TABLE "public"."PromoCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromoCode_discountPercent_check"
    CHECK ("discountPercent" BETWEEN 1 AND 10)
);

ALTER TABLE "public"."Payment"
  ADD COLUMN "promoCodeId" TEXT,
  ADD COLUMN "promoCodeSnapshot" TEXT,
  ADD COLUMN "promoDiscountPercent" INTEGER,
  ADD COLUMN "promoDiscountAmount" INTEGER,
  ADD COLUMN "clientPayableAmount" INTEGER,
  ADD COLUMN "stripeChargeAmount" INTEGER,
  ADD CONSTRAINT "Payment_promoDiscountPercent_check"
    CHECK ("promoDiscountPercent" IS NULL OR "promoDiscountPercent" BETWEEN 1 AND 10),
  ADD CONSTRAINT "Payment_promoDiscountAmount_check"
    CHECK ("promoDiscountAmount" IS NULL OR "promoDiscountAmount" >= 0),
  ADD CONSTRAINT "Payment_clientPayableAmount_check"
    CHECK ("clientPayableAmount" IS NULL OR "clientPayableAmount" >= 0),
  ADD CONSTRAINT "Payment_stripeChargeAmount_check"
    CHECK ("stripeChargeAmount" IS NULL OR "stripeChargeAmount" >= 0);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "public"."PromoCode"("code");
CREATE INDEX "PromoCode_isActive_idx" ON "public"."PromoCode"("isActive");
CREATE INDEX "PromoCode_expiresAt_idx" ON "public"."PromoCode"("expiresAt");
CREATE INDEX "PromoCode_createdAt_idx" ON "public"."PromoCode"("createdAt");
CREATE INDEX "Payment_promoCodeId_idx" ON "public"."Payment"("promoCodeId");
CREATE INDEX "Payment_promoCodeSnapshot_idx" ON "public"."Payment"("promoCodeSnapshot");

ALTER TABLE "public"."PromoCode"
  ADD CONSTRAINT "PromoCode_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Payment"
  ADD CONSTRAINT "Payment_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "public"."PromoCode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
