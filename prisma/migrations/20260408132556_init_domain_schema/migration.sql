-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('CLIENT', 'THERAPIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."TherapistApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING_THERAPIST', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'AUTO_CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'DONE');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "public"."UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TherapistProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "specialization" TEXT,
    "approvalStatus" "public"."TherapistApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarId" TEXT,
    "googleCalendarEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bookingStatus" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING_THERAPIST',
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "sessionStatus" "public"."SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "meetingUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TherapistPayoutDetails" (
    "id" TEXT NOT NULL,
    "therapistProfileId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankName" TEXT,
    "iban" TEXT,
    "swift" TEXT,
    "country" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistPayoutDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "public"."EmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "public"."User"("isActive");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "public"."User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProfile_userId_key" ON "public"."ClientProfile"("userId");

-- CreateIndex
CREATE INDEX "ClientProfile_createdAt_idx" ON "public"."ClientProfile"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistProfile_userId_key" ON "public"."TherapistProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistProfile_googleCalendarId_key" ON "public"."TherapistProfile"("googleCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistProfile_googleCalendarEmail_key" ON "public"."TherapistProfile"("googleCalendarEmail");

-- CreateIndex
CREATE INDEX "TherapistProfile_approvalStatus_idx" ON "public"."TherapistProfile"("approvalStatus");

-- CreateIndex
CREATE INDEX "TherapistProfile_isApproved_idx" ON "public"."TherapistProfile"("isApproved");

-- CreateIndex
CREATE INDEX "TherapistProfile_createdAt_idx" ON "public"."TherapistProfile"("createdAt");

-- CreateIndex
CREATE INDEX "TherapistProfile_approvalStatus_isApproved_idx" ON "public"."TherapistProfile"("approvalStatus", "isApproved");

-- CreateIndex
CREATE INDEX "Booking_clientId_idx" ON "public"."Booking"("clientId");

-- CreateIndex
CREATE INDEX "Booking_therapistId_idx" ON "public"."Booking"("therapistId");

-- CreateIndex
CREATE INDEX "Booking_startsAt_idx" ON "public"."Booking"("startsAt");

-- CreateIndex
CREATE INDEX "Booking_endsAt_idx" ON "public"."Booking"("endsAt");

-- CreateIndex
CREATE INDEX "Booking_bookingStatus_idx" ON "public"."Booking"("bookingStatus");

-- CreateIndex
CREATE INDEX "Booking_cancelledByUserId_idx" ON "public"."Booking"("cancelledByUserId");

-- CreateIndex
CREATE INDEX "Booking_clientId_startsAt_idx" ON "public"."Booking"("clientId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_therapistId_startsAt_idx" ON "public"."Booking"("therapistId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_bookingStatus_startsAt_idx" ON "public"."Booking"("bookingStatus", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_therapistId_bookingStatus_idx" ON "public"."Booking"("therapistId", "bookingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Session_bookingId_key" ON "public"."Session"("bookingId");

-- CreateIndex
CREATE INDEX "Session_sessionStatus_idx" ON "public"."Session"("sessionStatus");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "public"."Session"("createdAt");

-- CreateIndex
CREATE INDEX "Session_completedAt_idx" ON "public"."Session"("completedAt");

-- CreateIndex
CREATE INDEX "Session_sessionStatus_createdAt_idx" ON "public"."Session"("sessionStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "public"."Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "public"."Payment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "public"."Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Payment_paymentStatus_idx" ON "public"."Payment"("paymentStatus");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "public"."Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_currency_idx" ON "public"."Payment"("currency");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "public"."Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_failedAt_idx" ON "public"."Payment"("failedAt");

-- CreateIndex
CREATE INDEX "Payment_refundedAt_idx" ON "public"."Payment"("refundedAt");

-- CreateIndex
CREATE INDEX "Payment_paymentStatus_createdAt_idx" ON "public"."Payment"("paymentStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistPayoutDetails_therapistProfileId_key" ON "public"."TherapistPayoutDetails"("therapistProfileId");

-- CreateIndex
CREATE INDEX "TherapistPayoutDetails_isVerified_idx" ON "public"."TherapistPayoutDetails"("isVerified");

-- CreateIndex
CREATE INDEX "TherapistPayoutDetails_country_idx" ON "public"."TherapistPayoutDetails"("country");

-- CreateIndex
CREATE INDEX "TherapistPayoutDetails_createdAt_idx" ON "public"."TherapistPayoutDetails"("createdAt");

-- CreateIndex
CREATE INDEX "TherapistPayoutDetails_isVerified_country_idx" ON "public"."TherapistPayoutDetails"("isVerified", "country");

-- CreateIndex
CREATE INDEX "EmailLog_userId_idx" ON "public"."EmailLog"("userId");

-- CreateIndex
CREATE INDEX "EmailLog_email_idx" ON "public"."EmailLog"("email");

-- CreateIndex
CREATE INDEX "EmailLog_template_idx" ON "public"."EmailLog"("template");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "public"."EmailLog"("status");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "public"."EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_email_status_idx" ON "public"."EmailLog"("email", "status");

-- CreateIndex
CREATE INDEX "EmailLog_template_createdAt_idx" ON "public"."EmailLog"("template", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "public"."AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "public"."AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "public"."AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "public"."AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "public"."AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ClientProfile" ADD CONSTRAINT "ClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TherapistProfile" ADD CONSTRAINT "TherapistProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TherapistPayoutDetails" ADD CONSTRAINT "TherapistPayoutDetails_therapistProfileId_fkey" FOREIGN KEY ("therapistProfileId") REFERENCES "public"."TherapistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
