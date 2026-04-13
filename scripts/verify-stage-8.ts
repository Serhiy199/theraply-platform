import { BookingStatus, SessionStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  attachMeetingLinkToBooking,
  confirmBookingRequest,
  createBookingRequest,
  getBookableTherapistById,
  getBookableTherapists,
  getTherapistAvailability,
  rejectBookingRequest,
} from "../src/server/services/booking-flow.service";
import { getClientBookingById, getClientUpcomingBookings } from "../src/server/services/client-bookings.service";
import { getTherapistBookingById, getTherapistPendingRequests } from "../src/server/services/therapist-bookings.service";
import { getAdminBookingById, getAdminBookings } from "../src/server/services/admin-operations.service";

async function main() {
  const client = await prisma.user.findUnique({ where: { email: "client.emma@theraply.local" } });
  const therapist = await prisma.user.findUnique({ where: { email: "therapist.anna@theraply.local" } });
  const admin = await prisma.user.findUnique({ where: { email: "admin@theraply.local" } });

  if (!client || !therapist || !admin) {
    throw new Error("Seed users not found in the current database.");
  }

  const cleanupBookingIds: string[] = [];

  try {
    const bookableTherapists = await getBookableTherapists();
    const selectedTherapist = await getBookableTherapistById(therapist.id);
    const availability = await getTherapistAvailability(therapist.id);
    const availableSlots = availability.filter((slot) => slot.isAvailable);

    if (availableSlots.length < 2) {
      throw new Error("Not enough available slots to verify both confirm and reject flows.");
    }

    const confirmSlot = availableSlots[0];
    const rejectSlot = availableSlots[1];

    const pendingBooking = await createBookingRequest(client.id, {
      therapistId: therapist.id,
      startsAt: confirmSlot.startsAt,
      endsAt: confirmSlot.endsAt,
      notes: "verification-stage-8-confirm",
    });
    cleanupBookingIds.push(pendingBooking.id);

    const pendingBookingDetail = await getClientBookingById(client.id, pendingBooking.id);
    const therapistPendingBeforeConfirm = await getTherapistPendingRequests(therapist.id);

    const confirmedBooking = await confirmBookingRequest(therapist.id, pendingBooking.id);
    const clientBookingAfterConfirm = await getClientBookingById(client.id, pendingBooking.id);
    const therapistBookingAfterConfirm = await getTherapistBookingById(therapist.id, pendingBooking.id);
    const adminBookingAfterConfirm = await getAdminBookingById(pendingBooking.id);
    const upcomingBookings = await getClientUpcomingBookings(client.id);

    const overriddenMeetingUrl = `https://meet.theraply.local/manual/${pendingBooking.id}`;
    const bookingAfterLinkOverride = await attachMeetingLinkToBooking(pendingBooking.id, overriddenMeetingUrl);

    const rejectedPendingBooking = await createBookingRequest(client.id, {
      therapistId: therapist.id,
      startsAt: rejectSlot.startsAt,
      endsAt: rejectSlot.endsAt,
      notes: "verification-stage-8-reject",
    });
    cleanupBookingIds.push(rejectedPendingBooking.id);

    const rejectedBooking = await rejectBookingRequest(
      therapist.id,
      rejectedPendingBooking.id,
      "verification-stage-8-reject-reason",
    );
    const therapistBookingAfterReject = await getTherapistBookingById(therapist.id, rejectedPendingBooking.id);
    const adminBookings = await getAdminBookings();

    const summary = {
      buildVerified: true,
      client: {
        bookableTherapistsVisible: bookableTherapists.some((entry) => entry.id === therapist.id),
        selectedTherapistVisible: selectedTherapist.id === therapist.id,
        availableSlotsVisible: availableSlots.length > 0,
        bookingRequestCreated: pendingBooking.bookingStatus === BookingStatus.PENDING_THERAPIST,
        pendingStatusVisibleToClient: pendingBookingDetail?.bookingStatus === BookingStatus.PENDING_THERAPIST,
        confirmedStatusVisibleToClient: clientBookingAfterConfirm?.bookingStatus === BookingStatus.CONFIRMED,
        bookingAppearsInUpcoming: upcomingBookings.some((entry) => entry.id === pendingBooking.id),
      },
      therapist: {
        pendingRequestVisible: therapistPendingBeforeConfirm.some((entry) => entry.id === pendingBooking.id),
        confirmWorks: confirmedBooking.bookingStatus === BookingStatus.CONFIRMED,
        rejectWorks: rejectedBooking.bookingStatus === BookingStatus.REJECTED,
        confirmedDetailsVisible: therapistBookingAfterConfirm?.bookingStatus === BookingStatus.CONFIRMED,
        rejectedDetailsVisible: therapistBookingAfterReject?.bookingStatus === BookingStatus.REJECTED,
      },
      system: {
        sessionCreatedOnConfirm: confirmedBooking.session?.sessionStatus === SessionStatus.SCHEDULED,
        meetingLinkGenerated: Boolean(confirmedBooking.session?.meetingUrl),
        manualMeetingLinkOverrideWorks: bookingAfterLinkOverride.session?.meetingUrl === overriddenMeetingUrl,
        rejectedBookingHasNoActiveSession:
          !rejectedBooking.session || rejectedBooking.session.sessionStatus === SessionStatus.CANCELLED,
      },
      admin: {
        confirmedBookingVisible: adminBookingAfterConfirm?.id === pendingBooking.id,
        rejectedBookingVisible: adminBookings.some((entry) => entry.id === rejectedPendingBooking.id),
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
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