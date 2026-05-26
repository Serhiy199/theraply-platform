import { TherapistApprovalStatus } from "@prisma/client";

export type TherapistLifecycleProfile = {
  approvalStatus?: TherapistApprovalStatus | string | null;
  onboardingCompleted?: boolean | null;
  isApproved?: boolean | null;
};

export type TherapistLifecycleAccount = {
  emailVerified?: boolean | null;
  therapistProfile?: TherapistLifecycleProfile | null;
};

export const therapistDraftEditableStatuses = [
  TherapistApprovalStatus.PROFILE_INCOMPLETE,
  TherapistApprovalStatus.CHANGES_REQUESTED,
] as const;

export const therapistDraftLockedStatuses = [
  TherapistApprovalStatus.EMAIL_NOT_VERIFIED,
  TherapistApprovalStatus.PENDING_REVIEW,
  TherapistApprovalStatus.APPROVED,
  TherapistApprovalStatus.REJECTED,
  TherapistApprovalStatus.SUSPENDED,
] as const;

export function canEditTherapistOnboardingDraft(
  approvalStatus?: TherapistApprovalStatus | string | null,
) {
  return therapistDraftEditableStatuses.some((status) => status === approvalStatus);
}

export function isTherapistOnboardingDraftLocked(
  approvalStatus?: TherapistApprovalStatus | string | null,
) {
  return !canEditTherapistOnboardingDraft(approvalStatus);
}

export function canUseActiveTherapistFeatures(
  account: TherapistLifecycleAccount | null | undefined,
) {
  return (
    account?.emailVerified === true &&
    account.therapistProfile?.approvalStatus === TherapistApprovalStatus.APPROVED
  );
}

export function canShowTherapistPublicly(
  account: TherapistLifecycleAccount | null | undefined,
) {
  return (
    canUseActiveTherapistFeatures(account) &&
    account?.therapistProfile?.onboardingCompleted === true &&
    account.therapistProfile.isApproved === true
  );
}
