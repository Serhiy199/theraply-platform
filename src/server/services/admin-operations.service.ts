import {
  AuditLog,
  BookingStatus,
  Prisma,
  SessionStatus,
  TherapistApprovalStatus,
  TherapistReviewNoteType,
  UserRole,
  WixSyncStatus,
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
import {
  deleteTherapistGoogleCalendarEvent,
  GoogleCalendarServiceError,
} from "@/server/services/google-calendar.service";
import {
  refundPlatformCancellationIfEligible,
  RefundServiceError,
  type RefundExecutionResult,
} from "@/server/services/refund.service";
import {
  sendTherapistOnboardingApprovedEmail,
  sendTherapistOnboardingChangesRequestedEmail,
  sendTherapistOnboardingRejectedEmail,
} from "@/server/services/therapist-onboarding-email.service";
import { sendBookingCancelledEmailsBestEffort } from "@/server/services/transactional-email-events.service";
import { syncApprovedTherapistToWix } from "@/server/services/wix-therapist-sync.service";

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
  wixSubmissionId: string | null;
  wixSyncStatus: WixSyncStatus;
  wixSyncedAt: Date | null;
  wixSyncError: string | null;
  googleCalendarEmail: string | null;
  payoutVerified: boolean;
  payoutCountry: string | null;
  certificates: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

const adminTherapistReviewSelect = {
  id: true,
  userId: true,
  displayName: true,
  bio: true,
  specialization: true,
  sessionPricePence: true,
  gender: true,
  contactNumber: true,
  therapyServicesProvided: true,
  yearsOfExperience: true,
  educationAndCertifications: true,
  specialisation: true,
  pricePerHour: true,
  approvalStatus: true,
  isApproved: true,
  onboardingCompleted: true,
  submittedForReviewAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  profileDraft: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  certificates: {
    orderBy: {
      uploadedAt: "desc",
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      publicId: true,
      storageProvider: true,
      mimeType: true,
      size: true,
      uploadedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.TherapistProfileSelect;

export type AdminTherapistReviewItem = Prisma.TherapistProfileGetPayload<{
  select: typeof adminTherapistReviewSelect;
}>;

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
    public readonly code:
      | "BOOKING_NOT_FOUND"
      | "BOOKING_NOT_CANCELLABLE"
      | "ADMIN_NOT_FOUND"
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_PROFILE_NOT_PENDING_REVIEW"
      | "THERAPIST_REVIEW_MESSAGE_REQUIRED"
      | "THERAPIST_REVIEW_MESSAGE_INVALID"
      | "THERAPIST_REJECTION_REASON_REQUIRED"
      | "GOOGLE_CALENDAR_SYNC_FAILED"
      | "REFUND_FAILED",
  ) {
    super(message);
    this.name = "AdminOperationsServiceError";
  }
}

export type AdminBookingCancellationResult = {
  booking: BookingDetailsItem;
  refund: RefundExecutionResult;
};

export type AdminTherapistApprovalResult = {
  therapistProfile: AdminTherapistReviewItem;
  wixSync: {
    status: "synced" | "failed";
    message: string;
  };
};

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
      wixSubmissionId: true,
      wixSyncStatus: true,
      wixSyncedAt: true,
      wixSyncError: true,
      googleCalendarEmail: true,
      stripeAccountId: true,
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
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
      certificates: {
        orderBy: {
          uploadedAt: "desc",
        },
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          size: true,
          uploadedAt: true,
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
    wixSubmissionId: therapist.wixSubmissionId,
    wixSyncStatus: therapist.wixSyncStatus,
    wixSyncedAt: therapist.wixSyncedAt,
    wixSyncError: therapist.wixSyncError,
    googleCalendarEmail: therapist.googleCalendarEmail,
    payoutVerified:
      Boolean(therapist.stripeAccountId) &&
      therapist.stripeOnboardingStatus === "READY" &&
      therapist.stripeChargesEnabled &&
      therapist.stripePayoutsEnabled,
    payoutCountry: therapist.payoutDetails?.country ?? null,
    certificates: therapist.certificates,
    createdAt: therapist.createdAt,
    updatedAt: therapist.updatedAt,
  }));
}

export async function getAdminPendingTherapistReviews(): Promise<AdminTherapistReviewItem[]> {
  return prisma.therapistProfile.findMany({
    where: {
      approvalStatus: TherapistApprovalStatus.PENDING_REVIEW,
    },
    orderBy: [
      {
        submittedForReviewAt: "asc",
      },
      {
        updatedAt: "asc",
      },
    ],
    select: adminTherapistReviewSelect,
  });
}

export async function getAdminTherapistReviewById(
  therapistProfileId: string,
): Promise<AdminTherapistReviewItem | null> {
  return prisma.therapistProfile.findUnique({
    where: {
      id: therapistProfileId,
    },
    select: adminTherapistReviewSelect,
  });
}

async function getPendingTherapistReviewOrThrow(therapistProfileId: string) {
  const therapistProfile = await prisma.therapistProfile.findUnique({
    where: {
      id: therapistProfileId,
    },
    select: adminTherapistReviewSelect,
  });

  if (!therapistProfile) {
    throw new AdminOperationsServiceError(
      "Therapist profile not found.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  if (therapistProfile.approvalStatus !== TherapistApprovalStatus.PENDING_REVIEW) {
    throw new AdminOperationsServiceError(
      "Only therapist profiles pending review can be reviewed.",
      "THERAPIST_PROFILE_NOT_PENDING_REVIEW",
    );
  }

  return therapistProfile;
}

export async function approveTherapistReview(
  adminUserId: string,
  therapistProfileId: string,
): Promise<AdminTherapistApprovalResult> {
  await assertAdminExists(adminUserId);
  const therapistProfile = await getPendingTherapistReviewOrThrow(therapistProfileId);
  const now = getNow();

  const updatedProfile = await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.therapistProfile.update({
      where: {
        id: therapistProfile.id,
      },
      data: {
        approvalStatus: TherapistApprovalStatus.APPROVED,
        isApproved: true,
        approvedAt: now,
        rejectedAt: null,
        rejectionReason: null,
        profileDraft: Prisma.DbNull,
      },
      select: adminTherapistReviewSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        entityType: "TherapistProfile",
        entityId: therapistProfile.id,
        action: "ADMIN_APPROVE_THERAPIST",
        before: {
          approvalStatus: therapistProfile.approvalStatus,
          isApproved: therapistProfile.isApproved,
          approvedAt: therapistProfile.approvedAt,
          rejectedAt: therapistProfile.rejectedAt,
          rejectionReason: therapistProfile.rejectionReason,
        },
        after: {
          approvalStatus: updatedProfile.approvalStatus,
          isApproved: updatedProfile.isApproved,
          approvedAt: updatedProfile.approvedAt,
          rejectedAt: updatedProfile.rejectedAt,
          rejectionReason: updatedProfile.rejectionReason,
        },
      },
    });

    return updatedProfile;
  });

  await sendTherapistOnboardingApprovedEmail({
    userId: updatedProfile.userId,
    email: updatedProfile.user.email,
    firstName: updatedProfile.user.firstName,
    displayName: updatedProfile.displayName,
  });

  try {
    await syncApprovedTherapistToWix(updatedProfile.id);

    return {
      therapistProfile: updatedProfile,
      wixSync: {
        status: "synced",
        message: "Therapist approved and synchronized with Wix.",
      },
    };
  } catch {
    return {
      therapistProfile: updatedProfile,
      wixSync: {
        status: "failed",
        message:
          "Therapist approved, but synchronization with Wix failed. Please retry the synchronization.",
      },
    };
  }
}

export async function rejectTherapistReview(
  adminUserId: string,
  therapistProfileId: string,
  rejectionReason: string,
): Promise<AdminTherapistReviewItem> {
  await assertAdminExists(adminUserId);
  const normalizedReason = rejectionReason.trim();

  if (!normalizedReason) {
    throw new AdminOperationsServiceError(
      "Rejection reason is required.",
      "THERAPIST_REJECTION_REASON_REQUIRED",
    );
  }

  const therapistProfile = await getPendingTherapistReviewOrThrow(therapistProfileId);
  const now = getNow();

  const updatedProfile = await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.therapistProfile.update({
      where: {
        id: therapistProfile.id,
      },
      data: {
        approvalStatus: TherapistApprovalStatus.REJECTED,
        isApproved: false,
        approvedAt: null,
        rejectedAt: now,
        rejectionReason: normalizedReason,
      },
      select: adminTherapistReviewSelect,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        entityType: "TherapistProfile",
        entityId: therapistProfile.id,
        action: "ADMIN_REJECT_THERAPIST",
        before: {
          approvalStatus: therapistProfile.approvalStatus,
          isApproved: therapistProfile.isApproved,
          approvedAt: therapistProfile.approvedAt,
          rejectedAt: therapistProfile.rejectedAt,
          rejectionReason: therapistProfile.rejectionReason,
        },
        after: {
          approvalStatus: updatedProfile.approvalStatus,
          isApproved: updatedProfile.isApproved,
          approvedAt: updatedProfile.approvedAt,
          rejectedAt: updatedProfile.rejectedAt,
          rejectionReason: updatedProfile.rejectionReason,
        },
      },
    });

    return updatedProfile;
  });

  await sendTherapistOnboardingRejectedEmail({
    userId: updatedProfile.userId,
    email: updatedProfile.user.email,
    firstName: updatedProfile.user.firstName,
    displayName: updatedProfile.displayName,
    rejectionReason: normalizedReason,
  });

  return updatedProfile;
}

export async function requestTherapistReviewChanges(
  adminUserId: string,
  therapistProfileId: string,
  message: string,
): Promise<AdminTherapistReviewItem> {
  await assertAdminExists(adminUserId);
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    throw new AdminOperationsServiceError(
      "A message describing the required changes is required.",
      "THERAPIST_REVIEW_MESSAGE_REQUIRED",
    );
  }

  if (normalizedMessage.length < 10 || normalizedMessage.length > 2000) {
    throw new AdminOperationsServiceError(
      "The update request must be between 10 and 2000 characters.",
      "THERAPIST_REVIEW_MESSAGE_INVALID",
    );
  }

  const therapistProfile = await getPendingTherapistReviewOrThrow(therapistProfileId);

  const updatedProfile = await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.therapistProfile.update({
      where: {
        id: therapistProfile.id,
      },
      data: {
        approvalStatus: TherapistApprovalStatus.CHANGES_REQUESTED,
        isApproved: false,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      select: adminTherapistReviewSelect,
    });

    await tx.therapistReviewNote.create({
      data: {
        therapistProfileId: therapistProfile.id,
        adminId: adminUserId,
        type: TherapistReviewNoteType.CHANGES_REQUESTED,
        message: normalizedMessage,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        entityType: "TherapistProfile",
        entityId: therapistProfile.id,
        action: "ADMIN_REQUEST_THERAPIST_CHANGES",
        before: {
          approvalStatus: therapistProfile.approvalStatus,
          isApproved: therapistProfile.isApproved,
        },
        after: {
          approvalStatus: updatedProfile.approvalStatus,
          isApproved: updatedProfile.isApproved,
          reviewNoteType: TherapistReviewNoteType.CHANGES_REQUESTED,
        },
      },
    });

    return updatedProfile;
  });

  await sendTherapistOnboardingChangesRequestedEmail({
    userId: updatedProfile.userId,
    email: updatedProfile.user.email,
    firstName: updatedProfile.user.firstName,
    displayName: updatedProfile.displayName,
    changesRequestedMessage: normalizedMessage,
  });

  return updatedProfile;
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
): Promise<AdminBookingCancellationResult> {
  await assertAdminExists(adminUserId);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      bookingStatus: true,
      therapistId: true,
      cancelledAt: true,
      cancelledByUserId: true,
      session: {
        select: {
          id: true,
          sessionStatus: true,
          googleCalendarEventId: true,
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

  if (booking.session?.googleCalendarEventId) {
    try {
      await deleteTherapistGoogleCalendarEvent(
        booking.therapistId,
        booking.session.googleCalendarEventId,
      );
    } catch (error) {
      if (error instanceof GoogleCalendarServiceError) {
        throw new AdminOperationsServiceError(error.message, "GOOGLE_CALENDAR_SYNC_FAILED");
      }

      throw error;
    }
  }

  let refund: RefundExecutionResult = {
    status: "skipped",
    reason: "PAYMENT_NOT_FOUND",
    refundId: null,
    refundedAmount: null,
  };

  try {
    refund = await refundPlatformCancellationIfEligible({
      bookingId: booking.id,
      actorUserId: adminUserId,
      trigger: "ADMIN_MANUAL_CANCELLATION",
      businessReason: "Platform initiated a refund after manual admin cancellation.",
    });
  } catch (error) {
    if (error instanceof RefundServiceError) {
      throw new AdminOperationsServiceError(error.message, "REFUND_FAILED");
    }

    throw error;
  }

  const cancellationResult = await prisma.$transaction(async (tx) => {
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
          meetingUrl: null,
          googleCalendarEventId: null,
          googleCalendarConferenceId: null,
          googleCalendarEventHtmlLink: null,
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
          refundStatus: refund.status,
          refundReason: refund.reason,
          refundId: refund.refundId,
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

    return {
      booking: updatedBooking,
      refund,
    };
  });

  await sendBookingCancelledEmailsBestEffort(cancellationResult.booking.id, {
    reason: "Cancelled by Theraply support.",
  });

  return cancellationResult;
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
