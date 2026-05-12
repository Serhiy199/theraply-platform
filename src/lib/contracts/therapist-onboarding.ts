export const THERAPIST_ONBOARDING_DRAFT_VERSION = 2;

export const therapistOnboardingDraftFields = [
  "nameAndSurname",
  "gender",
  "email",
  "contactNumber",
  "therapyServicesProvided",
  "yearsOfExperience",
  "educationAndCertifications",
  "specialisation",
  "pricePerHour",
  "displayName",
  "bio",
  "specialization",
] as const;

export type TherapistOnboardingDraftField =
  (typeof therapistOnboardingDraftFields)[number];

export type TherapistOnboardingDraft = {
  version: typeof THERAPIST_ONBOARDING_DRAFT_VERSION;
  nameAndSurname?: string | null;
  gender?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  therapyServicesProvided?: string | null;
  yearsOfExperience?: string | null;
  educationAndCertifications?: string | null;
  specialisation?: string | null;
  pricePerHour?: string | null;
  displayName?: string | null;
  bio?: string | null;
  specialization?: string | null;
};

export const emptyTherapistOnboardingDraft: TherapistOnboardingDraft = {
  version: THERAPIST_ONBOARDING_DRAFT_VERSION,
  nameAndSurname: null,
  gender: null,
  email: null,
  contactNumber: null,
  therapyServicesProvided: null,
  yearsOfExperience: null,
  educationAndCertifications: null,
  specialisation: null,
  pricePerHour: null,
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

export function normalizeTherapistOnboardingDraft(input: unknown): TherapistOnboardingDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return emptyTherapistOnboardingDraft;
  }

  const draft = input as Partial<TherapistOnboardingDraft> & {
    version?: number;
  };

  return createTherapistOnboardingDraft({
    nameAndSurname: draft.nameAndSurname ?? draft.displayName ?? null,
    gender: draft.gender ?? null,
    email: draft.email ?? null,
    contactNumber: draft.contactNumber ?? null,
    therapyServicesProvided: draft.therapyServicesProvided ?? draft.bio ?? null,
    yearsOfExperience: draft.yearsOfExperience ?? null,
    educationAndCertifications: draft.educationAndCertifications ?? null,
    specialisation: draft.specialisation ?? draft.specialization ?? null,
    pricePerHour: draft.pricePerHour ?? null,
    displayName: draft.displayName ?? draft.nameAndSurname ?? null,
    bio: draft.bio ?? draft.therapyServicesProvided ?? null,
    specialization: draft.specialization ?? draft.specialisation ?? null,
  });
}
