export const THERAPIST_ONBOARDING_DRAFT_VERSION = 1;

export const therapistOnboardingDraftFields = [
  "displayName",
  "bio",
  "specialization",
] as const;

export type TherapistOnboardingDraftField =
  (typeof therapistOnboardingDraftFields)[number];

export type TherapistOnboardingDraft = {
  version: typeof THERAPIST_ONBOARDING_DRAFT_VERSION;
  displayName?: string | null;
  bio?: string | null;
  specialization?: string | null;
};

export const emptyTherapistOnboardingDraft: TherapistOnboardingDraft = {
  version: THERAPIST_ONBOARDING_DRAFT_VERSION,
  displayName: null,
  bio: null,
  specialization: null,
};

export function createTherapistOnboardingDraft(
  input: Partial<Omit<TherapistOnboardingDraft, "version">>,
): TherapistOnboardingDraft {
  return {
    ...emptyTherapistOnboardingDraft,
    ...input,
    version: THERAPIST_ONBOARDING_DRAFT_VERSION,
  };
}
