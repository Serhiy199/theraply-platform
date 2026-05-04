export const THERAPIST_ONBOARDING_LIMITS = {
  displayNameMaxLength: 120,
  bioMaxLength: 2000,
  specializationMaxLength: 240,
} as const;

export const THERAPIST_ONBOARDING_MESSAGES = {
  displayNameRequired: "Display name is required before submitting for review.",
  displayNameMaxLength: `Display name must be no longer than ${THERAPIST_ONBOARDING_LIMITS.displayNameMaxLength} characters.`,
  bioRequired: "Bio is required before submitting for review.",
  bioMaxLength: `Bio must be no longer than ${THERAPIST_ONBOARDING_LIMITS.bioMaxLength} characters.`,
  specializationRequired: "Specialization is required before submitting for review.",
  specializationMaxLength: `Specialization must be no longer than ${THERAPIST_ONBOARDING_LIMITS.specializationMaxLength} characters.`,
} as const;
