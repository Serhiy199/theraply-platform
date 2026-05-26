"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import {
  SAFE_ERROR_MESSAGES,
  getSafeCertificateStorageErrorMessage,
  getSafeTherapistOnboardingErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionRole } from "@/lib/permissions";
import {
  therapistOnboardingDraftSchema,
  therapistOnboardingSubmitSchema,
} from "@/lib/validations/therapist-onboarding";
import {
  saveTherapistOnboardingDraft,
  submitTherapistOnboardingForReview,
  TherapistOnboardingServiceError,
} from "@/server/services/therapist-onboarding.service";
import {
  CertificateStorageServiceError,
  uploadTherapistCertificates,
} from "@/server/services/certificate-storage.service";

export type TherapistOnboardingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    gender?: string[];
    contactNumber?: string[];
    therapyServicesProvided?: string[];
    yearsOfExperience?: string[];
    educationAndCertifications?: string[];
    specialisation?: string[];
    pricePerHour?: string[];
    displayName?: string[];
    bio?: string[];
    specialization?: string[];
  };
};

export type TherapistCertificateUploadActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    certificates?: string[];
  };
};

function getOnboardingInput(formData: FormData) {
  return {
    gender: formData.get("gender") ?? "",
    contactNumber: formData.get("contactNumber") ?? "",
    therapyServicesProvided: formData.get("therapyServicesProvided") ?? "",
    yearsOfExperience: formData.get("yearsOfExperience") ?? "",
    educationAndCertifications: formData.get("educationAndCertifications") ?? "",
    specialisation: formData.get("specialisation") ?? "",
    pricePerHour: formData.get("pricePerHour") ?? "",
  };
}

function getGenericErrorState(message: string): TherapistOnboardingActionState {
  return {
    status: "error",
    message,
  };
}

function getActionErrorState(error: unknown, fallbackMessage: string): TherapistOnboardingActionState {
  if (error instanceof ActionPermissionError) {
    return getGenericErrorState(SAFE_ERROR_MESSAGES.permissionDenied);
  }

  if (error instanceof TherapistOnboardingServiceError) {
    return getGenericErrorState(getSafeTherapistOnboardingErrorMessage(error.code));
  }

  return getGenericErrorState(fallbackMessage);
}

function getCertificateUploadFiles(formData: FormData) {
  return formData
    .getAll("certificates")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

function getCertificateUploadErrorState(
  error: unknown,
  fallbackMessage: string,
): TherapistCertificateUploadActionState {
  if (error instanceof ActionPermissionError) {
    return {
      status: "error",
      message: SAFE_ERROR_MESSAGES.permissionDenied,
    };
  }

  if (error instanceof CertificateStorageServiceError) {
    const safeMessage = getSafeCertificateStorageErrorMessage(error.code);

    return {
      status: "error",
      message: safeMessage,
      fieldErrors:
        error.code === "THERAPIST_CERTIFICATE_FILE_REQUIRED" ||
        error.code === "THERAPIST_CERTIFICATE_FILE_TOO_LARGE" ||
        error.code === "THERAPIST_CERTIFICATE_SERVER_ACTION_FILE_TOO_LARGE" ||
        error.code === "THERAPIST_CERTIFICATE_FILE_TYPE_UNSUPPORTED"
          ? {
              certificates: [safeMessage],
            }
          : undefined,
    };
  }

  return {
    status: "error",
    message: fallbackMessage,
  };
}

export async function saveTherapistOnboardingDraftAction(
  _prevState: TherapistOnboardingActionState,
  formData: FormData,
): Promise<TherapistOnboardingActionState> {
  try {
    const user = await requireActionRole(
      [UserRole.THERAPIST],
      "Only therapist accounts can save onboarding drafts.",
    );

    const parsed = therapistOnboardingDraftSchema.safeParse(getOnboardingInput(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "Please fix the highlighted onboarding fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    await saveTherapistOnboardingDraft(user.id, parsed.data);
    revalidatePath("/therapist/onboarding");

    return {
      status: "success",
      message: "Onboarding draft saved successfully.",
    };
  } catch (error) {
    return getActionErrorState(
      error,
      "Something went wrong while saving the onboarding draft.",
    );
  }
}

export async function submitTherapistOnboardingForReviewAction(
  _prevState: TherapistOnboardingActionState,
  formData: FormData,
): Promise<TherapistOnboardingActionState> {
  try {
    const user = await requireActionRole(
      [UserRole.THERAPIST],
      "Only therapist accounts can submit onboarding for review.",
    );

    const parsed = therapistOnboardingSubmitSchema.safeParse(getOnboardingInput(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "Complete the required onboarding fields before submitting for review.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    await submitTherapistOnboardingForReview(user.id, parsed.data);
    revalidatePath("/therapist/onboarding");

    return {
      status: "success",
      message: "Therapist onboarding submitted for review.",
    };
  } catch (error) {
    return getActionErrorState(
      error,
      "Something went wrong while submitting onboarding for review.",
    );
  }
}

export async function uploadTherapistCertificatesAction(
  _prevState: TherapistCertificateUploadActionState,
  formData: FormData,
): Promise<TherapistCertificateUploadActionState> {
  try {
    const user = await requireActionRole(
      [UserRole.THERAPIST],
      "Only therapist accounts can upload certificates.",
    );

    const draftParsed = therapistOnboardingDraftSchema.safeParse(getOnboardingInput(formData));

    if (draftParsed.success) {
      await saveTherapistOnboardingDraft(user.id, draftParsed.data);
    }

    const files = getCertificateUploadFiles(formData);
    const uploadedCertificates = await uploadTherapistCertificates(user.id, files);
    revalidatePath("/therapist/onboarding");
    revalidatePath("/admin/therapists");

    return {
      status: "success",
      message:
        uploadedCertificates.length === 1
          ? "Certificate uploaded successfully."
          : `${uploadedCertificates.length} certificates uploaded successfully.`,
    };
  } catch (error) {
    return getCertificateUploadErrorState(
      error,
      "Something went wrong while uploading certificates.",
    );
  }
}
