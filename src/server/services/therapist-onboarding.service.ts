import { Prisma, TherapistApprovalStatus } from "@prisma/client";
import type { TherapistOnboardingDraft } from "@/lib/contracts/therapist-onboarding";
import { canEditTherapistOnboardingDraft } from "@/lib/therapist-lifecycle";
import { therapistOnboardingDraftSchema } from "@/lib/validations/therapist-onboarding";
import { prisma } from "@/lib/prisma";

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

async function getTherapistOnboardingProfileOrThrow(userId: string) {
  const profile = await prisma.therapistProfile.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      userId: true,
      approvalStatus: true,
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

  const draft = parseTherapistOnboardingDraft(input);

  const updatedProfile = await prisma.therapistProfile.update({
    where: {
      id: profile.id,
    },
    data: {
      approvalStatus: TherapistApprovalStatus.PROFILE_INCOMPLETE,
      profileDraft: toPrismaJson(draft),
    },
    select: {
      id: true,
      userId: true,
      approvalStatus: true,
      profileDraft: true,
    },
  });

  return {
    profileId: updatedProfile.id,
    userId: updatedProfile.userId,
    approvalStatus: updatedProfile.approvalStatus,
    profileDraft: draft,
  };
}
