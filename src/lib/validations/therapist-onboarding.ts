import { z } from "zod";
import { createTherapistOnboardingDraft } from "@/lib/contracts/therapist-onboarding";
import {
  THERAPIST_ONBOARDING_LIMITS,
  THERAPIST_ONBOARDING_MESSAGES,
} from "@/lib/constants/therapist-onboarding";

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

export const therapistOnboardingDraftSchema = z
  .object({
    displayName: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.displayNameMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.displayNameMaxLength,
    ),
    bio: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.bioMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.bioMaxLength,
    ),
    specialization: optionalDraftTextField(
      THERAPIST_ONBOARDING_LIMITS.specializationMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.specializationMaxLength,
    ),
  })
  .transform((data) => createTherapistOnboardingDraft(data));

export const therapistOnboardingSubmitSchema = z
  .object({
    displayName: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.displayNameRequired,
      THERAPIST_ONBOARDING_LIMITS.displayNameMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.displayNameMaxLength,
    ),
    bio: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.bioRequired,
      THERAPIST_ONBOARDING_LIMITS.bioMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.bioMaxLength,
    ),
    specialization: requiredSubmitTextField(
      THERAPIST_ONBOARDING_MESSAGES.specializationRequired,
      THERAPIST_ONBOARDING_LIMITS.specializationMaxLength,
      THERAPIST_ONBOARDING_MESSAGES.specializationMaxLength,
    ),
  })
  .transform((data) => createTherapistOnboardingDraft(data));

export type TherapistOnboardingDraftInput = z.infer<
  typeof therapistOnboardingDraftSchema
>;

export type TherapistOnboardingSubmitInput = z.infer<
  typeof therapistOnboardingSubmitSchema
>;
