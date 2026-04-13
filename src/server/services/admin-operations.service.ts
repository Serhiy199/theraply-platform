import {
  AuditLog,
  BookingStatus,
  SessionStatus,
  UserRole,
} from "@prisma/client";
import {
  adminBookingRowSelect,
  bookingDetailsSelect,
  paymentSummarySelect,
  type AdminBookingRow,
  type BookingDetailsItem,
  type PaymentSummaryItem,
} from "@/lib/contracts/bookings";
import { prisma } from "@/lib/prisma";

export type AdminUserListItem = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminTherapistListItem = {
  id: string;
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  specialization: string | null;
  approvalStatus: string;
  isApproved: boolean;
  googleCalendarEmail: string | null;
  payoutVerified: boolean;
  payoutCountry: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminAuditLogItem = Pick<AuditLog, "id" | "entityType" | "entityId" | "action" | "before" | "after" | "createdAt"> & {
  actorUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: UserRole;
  } | null;
};

export class AdminOperationsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "BOOKING_NOT_FOUND" | "BOOKING_NOT_CANCELLABLE" | "ADMIN_NOT_FOUND",
  ) {
    super(message);
    this.name = "AdminOperationsServiceError";
  }
}

function getNow() {
  return new Date();
}

async function assertAdminExists(adminUserId: string) {
  const adminUser = await prisma.user.findFirst({
    where: {
      id: adminUserId,
      role: UserRole.ADMIN,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!adminUser) {
    throw new AdminOperationsServiceError("Admin account not found.", "ADMIN_NOT_FOUND");
  }

  return adminUser;
}

export async function getAdminClients(): Promise<AdminUserListItem[]> {
  return prisma.user.findMany({
    where: {
      role: UserRole.CLIENT,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getAdminTherapists(): Promise<AdminTherapistListItem[]> {
  const therapists = await prisma.therapistProfile.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      userId: true,
      displayName: true,
      specialization: true,
      approvalStatus: true,
      isApproved: true,
      googleCalendarEmail: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      payoutDetails: {
        select: {
          isVerified: true,
          country: true,
        },
      },
    },
  });

  return therapists.map((therapist) => ({
    id: therapist.id,
    userId: therapist.userId,
    email: therapist.user.email,
    firstName: therapist.user.firstName,
    lastName: therapist.user.lastName,
    displayName: therapist.displayName,
    specialization: therapist.specialization,
    approvalStatus: therapist.approvalStatus,
    isApproved: therapist.isApproved,
    googleCalendarEmail: therapist.googleCalendarEmail,
    payoutVerified: therapist.payoutDetails?.isVerified ?? false,
    payoutCountry: therapist.payoutDetails?.country ?? null,
    createdAt: therapist.createdAt,
    updatedAt: therapist.updatedAt,
  }));
}

export async function getAdminBookings(): Promise<AdminBookingRow[]> {
  return prisma.booking.findMany({
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: adminBookingRowSelect,
  });
}

export async function getAdminBookingById(bookingId: string): Promise<BookingDetailsItem | null> {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingDetailsSelect,
  });
}

export async function getAdminPayments(): Promise<PaymentSummaryItem[]> {
  return prisma.payment.findMany({
    orderBy: [{ createdAt: "desc" }, { paidAt: "desc" }],
    select: paymentSummarySelect,
  });
}

export async function adminCancelBooking(
  adminUserId: string,
  bookingId: string,
): Promise<BookingDetailsItem> {
  await assertAdminExists(adminUserId);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingStatus: true,
      cancelledAt: true,
      cancelledByUserId: true,
      session: {
        select: {
          id: true,
          sessionStatus: true,
        },
      },
    },
  });

  if (!booking) {
    throw new AdminOperationsServiceError("Booking not found.", "BOOKING_NOT_FOUND");
  }

  if (
    booking.bookingStatus === BookingStatus.CANCELLED ||
    booking.bookingStatus === BookingStatus.AUTO_CANCELLED ||
    booking.bookingStatus === BookingStatus.REJECTED ||
    booking.bookingStatus === BookingStatus.COMPLETED
  ) {
    throw new AdminOperationsServiceError(
      "This booking can no longer be cancelled manually.",
      "BOOKING_NOT_CANCELLABLE",
    );
  }

  const now = getNow();

  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: BookingStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: adminUserId,
      },
    });

    if (booking.session?.id && booking.session.sessionStatus !== SessionStatus.CANCELLED) {
      await tx.session.update({
        where: { id: booking.session.id },
        data: {
          sessionStatus: SessionStatus.CANCELLED,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        entityType: "Booking",
        entityId: booking.id,
        action: "ADMIN_CANCEL_BOOKING",
        before: {
          bookingStatus: booking.bookingStatus,
          cancelledAt: booking.cancelledAt,
          cancelledByUserId: booking.cancelledByUserId,
          sessionStatus: booking.session?.sessionStatus ?? null,
        },
        after: {
          bookingStatus: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancelledByUserId: adminUserId,
          sessionStatus: SessionStatus.CANCELLED,
        },
      },
    });

    const updatedBooking = await tx.booking.findUnique({
      where: { id: booking.id },
      select: bookingDetailsSelect,
    });

    if (!updatedBooking) {
      throw new AdminOperationsServiceError("Booking not found after cancel.", "BOOKING_NOT_FOUND");
    }

    return updatedBooking;
  });
}

export async function getAdminAuditLogs(limit = 50): Promise<AdminAuditLogItem[]> {
  return prisma.auditLog.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      actorUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  });
}
