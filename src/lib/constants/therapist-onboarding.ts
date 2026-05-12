export const THERAPIST_ONBOARDING_LIMITS = {
  displayNameMaxLength: 120,
  bioMaxLength: 2000,
  specializationMaxLength: 240,
  genderMaxLength: 32,
  contactNumberMaxLength: 80,
  therapyServicesProvidedMaxLength: 3000,
  yearsOfExperienceMaxLength: 80,
  educationAndCertificationsMaxLength: 4000,
  specialisationMaxLength: 3000,
  pricePerHourMaxLength: 80,
} as const;

export const THERAPIST_ONBOARDING_MESSAGES = {
  displayNameRequired: "Display name is required before submitting for review.",
  displayNameMaxLength: `Display name must be no longer than ${THERAPIST_ONBOARDING_LIMITS.displayNameMaxLength} characters.`,
  bioRequired: "Bio is required before submitting for review.",
  bioMaxLength: `Bio must be no longer than ${THERAPIST_ONBOARDING_LIMITS.bioMaxLength} characters.`,
  specializationRequired: "Specialization is required before submitting for review.",
  specializationMaxLength: `Specialization must be no longer than ${THERAPIST_ONBOARDING_LIMITS.specializationMaxLength} characters.`,
  genderRequired: "Choose a gender option before submitting for review.",
  genderInvalid: "Choose a valid gender option.",
  genderMaxLength: `Gender must be no longer than ${THERAPIST_ONBOARDING_LIMITS.genderMaxLength} characters.`,
  contactNumberRequired: "Contact number is required before submitting for review.",
  contactNumberMaxLength: `Contact number must be no longer than ${THERAPIST_ONBOARDING_LIMITS.contactNumberMaxLength} characters.`,
  therapyServicesProvidedRequired:
    "Therapy services provided is required before submitting for review.",
  therapyServicesProvidedMaxLength: `Therapy services provided must be no longer than ${THERAPIST_ONBOARDING_LIMITS.therapyServicesProvidedMaxLength} characters.`,
  yearsOfExperienceRequired:
    "Years of experience is required before submitting for review.",
  yearsOfExperienceMaxLength: `Years of experience must be no longer than ${THERAPIST_ONBOARDING_LIMITS.yearsOfExperienceMaxLength} characters.`,
  educationAndCertificationsRequired:
    "Education and certifications are required before submitting for review.",
  educationAndCertificationsMaxLength: `Education and certifications must be no longer than ${THERAPIST_ONBOARDING_LIMITS.educationAndCertificationsMaxLength} characters.`,
  specialisationRequired: "Specialisation is required before submitting for review.",
  specialisationMaxLength: `Specialisation must be no longer than ${THERAPIST_ONBOARDING_LIMITS.specialisationMaxLength} characters.`,
  pricePerHourRequired: "Price per hour is required before submitting for review.",
  pricePerHourMaxLength: `Price per hour must be no longer than ${THERAPIST_ONBOARDING_LIMITS.pricePerHourMaxLength} characters.`,
} as const;
