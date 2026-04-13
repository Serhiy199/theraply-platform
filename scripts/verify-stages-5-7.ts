import { prisma } from "../src/lib/prisma";
import { PaymentStatus, BookingStatus, SessionStatus } from "@prisma/client";
import {
  cancelClientBooking,
  getClientBookingById,
  getClientPastBookings,
  getClientPayments,
  getClientUpcomingBookings,
} from "../src/server/services/client-bookings.service";
import {
  confirmTherapistBooking,
  getTherapistBookingById,
  getTherapistClients,
  getTherapistPastSessions,
  getTherapistPendingRequests,
  getTherapistPayoutDetails,
  getTherapistUpcomingSessions,
  rejectTherapistBooking,
  updateTherapistPayoutDetails,
} from "../src/server/services/therapist-bookings.service";
import {
  adminCancelBooking,
  getAdminAuditLogs,
  getAdminBookingById,
  getAdminBookings,
  getAdminClients,
  getAdminPayments,
  getAdminTherapists,
} from "../src/server/services/admin-operations.service";

async function main() {
  const client = await prisma.user.findUnique({ where: { email: "client.emma@theraply.local" } });
  const therapist = await prisma.user.findUnique({ where: { email: "therapist.anna@theraply.local" } });
  const admin = await prisma.user.findUnique({ where: { email: "admin@theraply.local" } });

  if (!client || !therapist || !admin) {
    throw new Error("Seed users not found in local database.");
  }

  const cleanupBookingIds: string[] = [];
  let createdAuditId: string | null = null;
  const originalPayout = await prisma.therapistPayoutDetails.findFirst({
    where: { therapistProfile: { userId: therapist.id } },
    select: {
      accountHolderName: true,
      bankName: true,
      iban: true,
      swift: true,
      country: true,
      isVerified: true,
    },
  });

  try {
    const clientUpcoming = await getClientUpcomingBookings(client.id);
    const clientPast = await getClientPastBookings(client.id);
    const clientPayments = await getClientPayments(client.id);

    const therapistPending = await getTherapistPendingRequests(therapist.id);
    const therapistUpcoming = await getTherapistUpcomingSessions(therapist.id);
    const therapistPast = await getTherapistPastSessions(therapist.id);
    const therapistClients = await getTherapistClients(therapist.id);
    const therapistPayoutBefore = await getTherapistPayoutDetails(therapist.id);

    const adminClients = await getAdminClients();
    const adminTherapists = await getAdminTherapists();
    const adminBookings = await getAdminBookings();
    const adminPayments = await getAdminPayments();
    const adminAuditBefore = await getAdminAuditLogs(5);

    const futureStart = new Date(Date.now() + 1000 * 60 * 60 * 48);
    const futureEnd = new Date(futureStart.getTime() + 1000 * 60 * 60);
    const laterStart = new Date(Date.now() + 1000 * 60 * 60 * 72);
    const laterEnd = new Date(laterStart.getTime() + 1000 * 60 * 60);
    const evenLaterStart = new Date(Date.now() + 1000 * 60 * 60 * 96);
    const evenLaterEnd = new Date(evenLaterStart.getTime() + 1000 * 60 * 60);
    const adminStart = new Date(Date.now() + 1000 * 60 * 60 * 120);
    const adminEnd = new Date(adminStart.getTime() + 1000 * 60 * 60);

    const clientCancelBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: futureStart,
        endsAt: futureEnd,
        bookingStatus: BookingStatus.PENDING_THERAPIST,
        notes: "verification-client-cancel",
        payment: { create: { amount: 12000, currency: "usd", paymentStatus: PaymentStatus.UNPAID } },
      },
    });
    cleanupBookingIds.push(clientCancelBooking.id);

    await cancelClientBooking(client.id, clientCancelBooking.id);
    const clientCancelledRecord = await prisma.booking.findUnique({ where: { id: clientCancelBooking.id } });

    const therapistConfirmBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: laterStart,
        endsAt: laterEnd,
        bookingStatus: BookingStatus.PENDING_THERAPIST,
        notes: "verification-therapist-confirm",
      },
    });
    cleanupBookingIds.push(therapistConfirmBooking.id);

    await confirmTherapistBooking(therapist.id, therapistConfirmBooking.id);
    const therapistConfirmedRecord = await prisma.booking.findUnique({
      where: { id: therapistConfirmBooking.id },
      include: { session: true },
    });

    const therapistRejectBooking = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: evenLaterStart,
        endsAt: evenLaterEnd,
        bookingStatus: BookingStatus.PENDING_THERAPIST,
        notes: "verification-therapist-reject",
      },
    });
    cleanupBookingIds.push(therapistRejectBooking.id);

    await rejectTherapistBooking(therapist.id, therapistRejectBooking.id);
    const therapistRejectedRecord = await prisma.booking.findUnique({
      where: { id: therapistRejectBooking.id },
      include: { session: true },
    });

    const adminCancelSeed = await prisma.booking.create({
      data: {
        clientId: client.id,
        therapistId: therapist.id,
        startsAt: adminStart,
        endsAt: adminEnd,
        bookingStatus: BookingStatus.CONFIRMED,
        notes: "verification-admin-cancel",
        session: {
          create: {
            sessionStatus: SessionStatus.SCHEDULED,
            meetingUrl: "https://meet.example.com/verification-admin",
          },
        },
        payment: { create: { amount: 15000, currency: "usd", paymentStatus: PaymentStatus.PAID, paidAt: new Date() } },
      },
    });
    cleanupBookingIds.push(adminCancelSeed.id);

    await adminCancelBooking(admin.id, adminCancelSeed.id);
    const adminCancelledRecord = await prisma.booking.findUnique({
      where: { id: adminCancelSeed.id },
      include: { session: true },
    });
    const createdAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Booking", entityId: adminCancelSeed.id, action: "ADMIN_CANCEL_BOOKING" },
      orderBy: { createdAt: "desc" },
    });
    createdAuditId = createdAudit?.id ?? null;

    await updateTherapistPayoutDetails(therapist.id, {
      accountHolderName: "Anna Verification",
      bankName: "Theraply QA Bank",
      iban: "UA123456789012345678901234567",
      swift: "QAABUA22",
      country: "Ukraine",
    });
    const therapistPayoutAfter = await getTherapistPayoutDetails(therapist.id);

    const clientDetail = await getClientBookingById(client.id, clientCancelBooking.id);
    const therapistDetail = await getTherapistBookingById(therapist.id, therapistConfirmBooking.id);
    const adminDetail = await getAdminBookingById(adminCancelSeed.id);
    const adminAuditAfter = await getAdminAuditLogs(10);

    const summary = {
      buildVerified: true,
      client: {
        upcomingSessionsLoaded: Array.isArray(clientUpcoming),
        pastSessionsLoaded: Array.isArray(clientPast),
        paymentsLoaded: Array.isArray(clientPayments),
        bookingDetailsLoaded: Boolean(clientDetail),
        cancelFlowWorks:
          clientCancelledRecord?.bookingStatus === BookingStatus.CANCELLED && clientCancelledRecord.cancelledByUserId === client.id,
      },
      therapist: {
        pendingRequestsLoaded: Array.isArray(therapistPending),
        upcomingSessionsLoaded: Array.isArray(therapistUpcoming),
        sessionHistoryLoaded: Array.isArray(therapistPast),
        clientsLoaded: Array.isArray(therapistClients),
        requestDetailsLoaded: Boolean(therapistDetail),
        confirmWorks:
          therapistConfirmedRecord?.bookingStatus === BookingStatus.CONFIRMED && therapistConfirmedRecord.session?.sessionStatus === SessionStatus.SCHEDULED,
        rejectWorks: therapistRejectedRecord?.bookingStatus === BookingStatus.REJECTED,
        payoutDetailsVisible: Boolean(therapistPayoutBefore.profile),
        payoutUpdateWorks: therapistPayoutAfter.payoutDetails?.accountHolderName === "Anna Verification",
      },
      admin: {
        usersLoaded: Array.isArray(adminClients),
        therapistsLoaded: Array.isArray(adminTherapists),
        bookingsLoaded: Array.isArray(adminBookings),
        paymentsLoaded: Array.isArray(adminPayments),
        bookingDetailsLoaded: Boolean(adminDetail),
        adminCancelWorks:
          adminCancelledRecord?.bookingStatus === BookingStatus.CANCELLED && adminCancelledRecord.cancelledByUserId === admin.id,
        auditVisible: adminAuditAfter.some((entry) => entry.entityId === adminCancelSeed.id),
        auditBaselineCount: adminAuditBefore.length,
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (originalPayout) {
      await prisma.therapistPayoutDetails.updateMany({
        where: { therapistProfile: { userId: therapist.id } },
        data: {
          accountHolderName: originalPayout.accountHolderName,
          bankName: originalPayout.bankName,
          iban: originalPayout.iban,
          swift: originalPayout.swift,
          country: originalPayout.country,
          isVerified: originalPayout.isVerified,
        },
      });
    }

    if (createdAuditId) {
      await prisma.auditLog.deleteMany({ where: { id: createdAuditId } });
    }

    if (cleanupBookingIds.length) {
      await prisma.payment.deleteMany({ where: { bookingId: { in: cleanupBookingIds } } });
      await prisma.session.deleteMany({ where: { bookingId: { in: cleanupBookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: cleanupBookingIds } } });
    }

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
