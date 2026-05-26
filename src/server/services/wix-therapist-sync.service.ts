import "server-only";
import { Prisma, TherapistApprovalStatus, WixSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createAuditLogEntryBestEffort,
  logDiagnosticEvent,
} from "@/server/services/audit-log.service";
import {
  createWixTherapistApplicationSubmission,
  type WixTherapistApplicationInput,
  WixFormsServiceError,
} from "@/server/services/wix-forms.service";

const THERAPIST_PROFILE_NOT_FOUND_MESSAGE = "Профіль терапевта не знайдено.";
const THERAPIST_NOT_APPROVED_MESSAGE =
  "До Wix можна синхронізувати лише погодженого терапевта.";
const WIX_SYNC_FAILED_MESSAGE = "Не вдалося синхронізувати терапевта з Wix.";

const wixTherapistSyncProfileSelect = {
  id: true,
  displayName: true,
  specialization: true,
  gender: true,
  contactNumber: true,
  therapyServicesProvided: true,
  yearsOfExperience: true,
  educationAndCertifications: true,
  specialisation: true,
  pricePerHour: true,
  approvalStatus: true,
  wixSubmissionId: true,
  wixSyncStatus: true,
  wixSyncedAt: true,
  wixSyncError: true,
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  certificates: {
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      storageProvider: true,
      mimeType: true,
      size: true,
    },
  },
} satisfies Prisma.TherapistProfileSelect;

type WixTherapistSyncProfile = Prisma.TherapistProfileGetPayload<{
  select: typeof wixTherapistSyncProfileSelect;
}>;

export type WixTherapistSyncResult = {
  success: true;
  wixSubmissionId: string;
  wixSyncedAt: Date;
};

export class WixTherapistSyncServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_NOT_APPROVED"
      | "WIX_THERAPIST_SYNC_FAILED",
  ) {
    super(message);
    this.name = "WixTherapistSyncServiceError";
  }
}

function buildTherapistFullName(profile: WixTherapistSyncProfile) {
  return (
    [profile.user.firstName, profile.user.lastName].filter(Boolean).join(" ").trim() ||
    profile.displayName?.trim() ||
    profile.user.email
  );
}

export function buildApprovedTherapistWixInput(
  profile: WixTherapistSyncProfile,
): WixTherapistApplicationInput {
  return {
    nameAndSurname: buildTherapistFullName(profile),
    gender: profile.gender ?? "",
    email: profile.user.email,
    contactNumber: profile.contactNumber ?? "",
    therapyServicesProvided: profile.therapyServicesProvided ?? "",
    yearsOfExperience: profile.yearsOfExperience ?? "",
    educationAndCertifications: profile.educationAndCertifications ?? "",
    specialisation: profile.specialisation ?? profile.specialization ?? "",
    pricePerHour: profile.pricePerHour ?? "",
    // Certificate uploads are optional WIX_FILE values and require a future media upload flow.
    certificates: null,
  };
}

function getSafeNormalizedSyncError(error: unknown) {
  if (error instanceof WixFormsServiceError) {
    return error.message;
  }

  return WIX_SYNC_FAILED_MESSAGE;
}

async function getTherapistProfileForWixSync(therapistProfileId: string) {
  const therapistProfile = await prisma.therapistProfile.findUnique({
    where: {
      id: therapistProfileId,
    },
    select: wixTherapistSyncProfileSelect,
  });

  if (!therapistProfile) {
    throw new WixTherapistSyncServiceError(
      THERAPIST_PROFILE_NOT_FOUND_MESSAGE,
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  if (therapistProfile.approvalStatus !== TherapistApprovalStatus.APPROVED) {
    throw new WixTherapistSyncServiceError(
      THERAPIST_NOT_APPROVED_MESSAGE,
      "THERAPIST_NOT_APPROVED",
    );
  }

  return therapistProfile;
}

export async function syncApprovedTherapistToWix(
  therapistProfileId: string,
): Promise<WixTherapistSyncResult> {
  const therapistProfile = await getTherapistProfileForWixSync(therapistProfileId);
  const submissionInput = buildApprovedTherapistWixInput(therapistProfile);

  try {
    const result = await createWixTherapistApplicationSubmission(submissionInput);
    const wixSyncedAt = new Date();

    await prisma.therapistProfile.update({
      where: {
        id: therapistProfile.id,
      },
      data: {
        wixSubmissionId: result.wixSubmissionId,
        wixSyncStatus: WixSyncStatus.SYNCED,
        wixSyncedAt,
        wixSyncError: null,
      },
    });

    await createAuditLogEntryBestEffort({
      entityType: "TherapistProfile",
      entityId: therapistProfile.id,
      action: "WIX_THERAPIST_SYNC_SUCCEEDED",
      before: {
        wixSubmissionId: therapistProfile.wixSubmissionId,
        wixSyncStatus: therapistProfile.wixSyncStatus,
        wixSyncedAt: therapistProfile.wixSyncedAt,
        wixSyncError: therapistProfile.wixSyncError,
      },
      after: {
        wixSubmissionId: result.wixSubmissionId,
        wixSyncStatus: WixSyncStatus.SYNCED,
        wixSyncedAt,
        wixSyncError: null,
      },
    });

    return {
      success: true,
      wixSubmissionId: result.wixSubmissionId,
      wixSyncedAt,
    };
  } catch (error) {
    const safeNormalizedError = getSafeNormalizedSyncError(error);

    logDiagnosticEvent("wix-therapist-sync", "Unable to sync approved therapist to Wix.", {
      therapistProfileId: therapistProfile.id,
      certificateCount: therapistProfile.certificates.length,
      error,
    });

    await prisma.therapistProfile.update({
      where: {
        id: therapistProfile.id,
      },
      data: {
        wixSyncStatus: WixSyncStatus.FAILED,
        wixSyncedAt: null,
        wixSyncError: safeNormalizedError,
      },
    });

    await createAuditLogEntryBestEffort({
      entityType: "TherapistProfile",
      entityId: therapistProfile.id,
      action: "WIX_THERAPIST_SYNC_FAILED",
      before: {
        wixSubmissionId: therapistProfile.wixSubmissionId,
        wixSyncStatus: therapistProfile.wixSyncStatus,
        wixSyncedAt: therapistProfile.wixSyncedAt,
        wixSyncError: therapistProfile.wixSyncError,
      },
      after: {
        wixSubmissionId: therapistProfile.wixSubmissionId,
        wixSyncStatus: WixSyncStatus.FAILED,
        wixSyncedAt: null,
        wixSyncError: safeNormalizedError,
      },
    });

    throw new WixTherapistSyncServiceError(
      safeNormalizedError,
      "WIX_THERAPIST_SYNC_FAILED",
    );
  }
}
