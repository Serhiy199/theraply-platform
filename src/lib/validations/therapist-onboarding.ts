import { z } from "zod";
import { createTherapistOnboardingDraft } from "@/lib/contracts/therapist-onboarding";
import {
  THERAPIST_ONBOARDING_LIMITS,
  THERAPIST_ONBOARDING_MESSAGES,
} from "@/lib/constants/therapist-onboarding";

export const therapistGenderOptions = [
  "Female",
  "Male",
  "Other",
  "Prefer not to say",
] as const;

const optionalDraftTextField = (maxLength: number, maxLengthMessage: string) =>
  z
    .string()
    .trim()
    .max(maxLength, maxLengthMessage)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value?.trim() ? value.trim() : null));

const requiredSubmitTextField = (
  requiredMessage: string,
  maxLength: number,
  maxLengthMessage: string,
) => z.string().trim().min(1, requiredMessage).max(maxLength, maxLengthMessage);

const optionalGenderField = optionalDraftTextField(
  THERAPIST_ONBOARDING_LIMITS.genderMaxLength,
  THERAPIST_ONBOARDING_MESSAGES.genderMaxLength,
).refine(
  (value) => value === null || therapistGenderOptions.some((option) => option === value),
  THERAPIST_ONBOARDING_MESSAGES.genderInvalid,
);

const requiredGenderField = z
  .string()
  .trim()
  .min(1, THERAPIST_ONBOARDING_MESSAGES.genderRequired)
  .max(
    THERAPIST_ONBOARDING_LIMITS.genderMaxLength,
    THERAPIST_ONBOARDING_MESSAGES.genderMaxLength,
  )
  .refine(
    (value) => therapistGenderOptions.some((option) => option === value),
    THERAPIST_ONBOARDING_MESSAGES.genderInvalid,
  );

export const therapistOnboardingDraftSchema = z
  .object({
    gender: optionalGenderField,
    contactNumber: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.contactNumberMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.contactNumberMaxLength,
    ),
    therapyServicesProvided: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.therapyServicesProvidedMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.therapyServicesProvidedMaxLength,
    ),
    yearsOfExperience: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.yearsOfExperienceMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.yearsOfExperienceMaxLength,
    ),
    educationAndCertifications: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.educationAndCertificationsMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.educationAndCertificationsMaxLength,
    ),
    specialisation: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.specialisationMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.specialisationMaxLength,
    ),
    pricePerHour: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.pricePerHourMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.pricePerHourMaxLength,
    ),
  })
  .transform((data) =>
    createTherapistOnboardingDraft({
      ...data,
      bio: data.therapyServicesProvided,
      specialization: data.specialisation,
    }),
  );

export const therapistOnboardingSubmitSchema = z
  .object({
    gender: requiredGenderField,
    contactNumber: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.contactNumberRequired,
      THERAPIST_ONBOARDING_LIMITS.contactNumberMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.contactNumberMaxLength,
    ),
    therapyServicesProvided: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.therapyServicesProvidedRequired,
      THERAPIST_ONBOARDING_LIMITS.therapyServicesProvidedMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.therapyServicesProvidedMaxLength,
    ),
    yearsOfExperience: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.yearsOfExperienceRequired,
      THERAPIST_ONBOARDING_LIMITS.yearsOfExperienceMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.yearsOfExperienceMaxLength,
    ),
    educationAndCertifications: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.educationAndCertificationsRequired,
      THERAPIST_ONBOARDING_LIMITS.educationAndCertificationsMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.educationAndCertificationsMaxLength,
    ),
    specialisation: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.specialisationRequired,
      THERAPIST_ONBOARDING_LIMITS.specialisationMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.specialisationMaxLength,
    ),
    pricePerHour: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.pricePerHourRequired,
      THERAPIST_ONBOARDING_LIMITS.pricePerHourMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.pricePerHourMaxLength,
    ),
  })
  .transform((data) =>
    createTherapistOnboardingDraft({
      ...data,
      bio: data.therapyServicesProvided,
      specialization: data.specialisation,
    }),
  );

export type TherapistOnboardingDraftInput = z.infer<
  typeof therapistOnboardingDraftSchema
>;

export type TherapistOnboardingSubmitInput = z.infer<
  typeof therapistOnboardingSubmitSchema
>;
