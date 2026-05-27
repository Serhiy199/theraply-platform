import { Prisma, TherapistApprovalStatus } from "@prisma/client";
import type { TherapistOnboardingDraft } from "@/lib/contracts/therapist-onboarding";
import { canEditTherapistOnboardingDraft } from "@/lib/therapist-lifecycle";
import {
  therapistOnboardingDraftSchema,
  therapistOnboardingSubmitSchema,
} from "@/lib/validations/therapist-onboarding";
import { prisma } from "@/lib/prisma";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
import { sendTherapistOnboardingPendingReviewEmail } from "@/server/services/therapist-onboarding-email.service";

export type TherapistOnboardingDraftResult = {
  profileId: string;
  userId: string;
  approvalStatus: TherapistApprovalStatus;
  profileDraft: TherapistOnboardingDraft;
};

export class TherapistOnboardingServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "THERAPIST_ONBOARDING_LOCKED"
      | "THERAPIST_ONBOARDING_INVALID_DRAFT",
  ) {
    super(message);
    this.name = "TherapistOnboardingServiceError";
  }
}

function toPrismaJson(value: TherapistOnboardingDraft): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function getUserDisplayName(user: { firstName: string | null; lastName: string | null; email: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

function withTrustedUserSnapshot(
  draft: TherapistOnboardingDraft,
  user: { firstName: string | null; lastName: string | null; email: string },
): TherapistOnboardingDraft {
  const displayName = getUserDisplayName(user);

  return {
    ...draft,
    nameAndSurname: displayName,
    email: user.email,
    displayName,
  };
}

function parseTherapistOnboardingDraft(input: unknown) {
  const parsed = therapistOnboardingDraftSchema.safeParse(input);

  if (!parsed.success) {
    throw new TherapistOnboardingServiceError(
      "Therapist onboarding draft is invalid.",
      "THERAPIST_ONBOARDING_INVALID_DRAFT",
    );
  }

  return parsed.data;
}

function parseTherapistOnboardingSubmit(input: unknown) {
  const parsed = therapistOnboardingSubmitSchema.safeParse(input);

  if (!parsed.success) {
    throw new TherapistOnboardingServiceError(
      "Therapist onboarding submission is invalid.",
      "THERAPIST_ONBOARDING_INVALID_DRAFT",
    );
  }

  return parsed.data;
}

async function getTherapistOnboardingProfileOrThrow(userId: string) {
  const profile = await prisma.therapistProfile.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      userId: true,
      approvalStatus: true,
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!profile) {
    throw new TherapistOnboardingServiceError(
      "Therapist profile not found for this account.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  return profile;
}

export async function saveTherapistOnboardingDraft(
  userId: string,
  input: unknown,
): Promise<TherapistOnboardingDraftResult> {
  const profile = await getTherapistOnboardingProfileOrThrow(userId);

  if (!canEditTherapistOnboardingDraft(profile.approvalStatus)) {
    throw new TherapistOnboardingServiceError(
      "Therapist onboarding draft cannot be edited in the current status.",
      "THERAPIST_ONBOARDING_LOCKED",
    );
  }

  const draft = withTrustedUserSnapshot(parseTherapistOnboardingDraft(input), profile.user);
  const draftStatus =
    profile.approvalStatus === TherapistApprovalStatus.CHANGES_REQUESTED
      ? TherapistApprovalStatus.CHANGES_REQUESTED
      : TherapistApprovalStatus.PROFILE_INCOMPLETE;

  const updatedProfile = await prisma.therapistProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      approvalStatus: draftStatus,
      profileDraft: toPrismaJson(draft),
    },
    select: {
      id: true,
      userId: true,
      approvalStatus: true,
      profileDraft: true,
    },
  });

  await createAuditLogEntryBestEffort({
    actorUserId: userId,
    entityType: "TherapistProfile",
    entityId: updatedProfile.id,
    action: "THERAPIST_ONBOARDING_DRAFT_SAVED",
    before: {
      approvalStatus: profile.approvalStatus,
    },
    after: {
      approvalStatus: updatedProfile.approvalStatus,
      draftVersion: draft.version,
    },
  });

  return {
    profileId: updatedProfile.id,
    userId: updatedProfile.userId,
    approvalStatus: updatedProfile.approvalStatus,
    profileDraft: draft,
  };
}

export async function submitTherapistOnboardingForReview(
  userId: string,
  input: unknown,
): Promise<TherapistOnboardingDraftResult> {
  const profile = await getTherapistOnboardingProfileOrThrow(userId);

  if (!canEditTherapistOnboardingDraft(profile.approvalStatus)) {
    throw new TherapistOnboardingServiceError(
      "Therapist onboarding cannot be submitted in the current status.",
      "THERAPIST_ONBOARDING_LOCKED",
    );
  }

  const draft = withTrustedUserSnapshot(parseTherapistOnboardingSubmit(input), profile.user);
  const now = new Date();

  const updatedProfile = await prisma.therapistProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      displayName: draft.displayName,
      bio: draft.bio,
      gender: draft.gender,
      contactNumber: draft.contactNumber,
      therapyServicesProvided: draft.therapyServicesProvided,
      yearsOfExperience: draft.yearsOfExperience,
      educationAndCertifications: draft.educationAndCertifications,
      specialisation: draft.specialisation,
      specialization: draft.specialization,
      pricePerHour: draft.pricePerHour,
      approvalStatus: TherapistApprovalStatus.PENDING_REVIEW,
      isApproved: false,
      onboardingCompleted: true,
      submittedForReviewAt: now,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      profileDraft: toPrismaJson(draft),
    },
    select: {
      id: true,
      userId: true,
      approvalStatus: true,
      profileDraft: true,
      displayName: true,
      user: {
        select: {
          email: true,
          firstName: true,
        },
      },
    },
  });

  await createAuditLogEntryBestEffort({
    actorUserId: userId,
    entityType: "TherapistProfile",
    entityId: updatedProfile.id,
    action: "THERAPIST_ONBOARDING_SUBMITTED_FOR_REVIEW",
    before: {
      approvalStatus: profile.approvalStatus,
    },
    after: {
      approvalStatus: updatedProfile.approvalStatus,
      onboardingCompleted: true,
      submittedForReviewAt: now,
      draftVersion: draft.version,
    },
  });

  await sendTherapistOnboardingPendingReviewEmail({
    userId: updatedProfile.userId,
    email: updatedProfile.user.email,
    firstName: updatedProfile.user.firstName,
    displayName: updatedProfile.displayName,
  });

  return {
    profileId: updatedProfile.id,
    userId: updatedProfile.userId,
    approvalStatus: updatedProfile.approvalStatus,
    profileDraft: draft,
  };
}
