"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  AdminOperationsServiceError,
  approveTherapistReview,
  rejectTherapistReview,
} from "@/server/services/admin-operations.service";

export type AdminTherapistReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function getTherapistProfileId(formData: FormData) {
  return String(formData.get("therapistProfileId") ?? "").trim();
}

function getErrorState(
  error: unknown,
  fallbackMessage: string,
): AdminTherapistReviewActionState {
  if (error instanceof ActionPermissionError) {
    return {
      status: "error",
      message: error.message,
    };
  }

  if (error instanceof AdminOperationsServiceError) {
    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "error",
    message: fallbackMessage,
  };
}

export async function approveTherapistAction(
  _prevState: AdminTherapistReviewActionState,
  formData: FormData,
): Promise<AdminTherapistReviewActionState> {
  const user = await getCurrentUser();
  const therapistProfileId = getTherapistProfileId(formData);

  try {
    assertActionRole(
      user,
      [UserRole.ADMIN],
      "Only admin accounts can approve therapist profiles.",
    );

    if (!therapistProfileId) {
      return {
        status: "error",
        message: "Therapist profile identifier is missing.",
      };
    }

    await approveTherapistReview(user.id, therapistProfileId);
    revalidatePath("/admin/therapists");
    revalidatePath("/admin/dashboard");
    revalidatePath("/therapist/onboarding");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: "Therapist profile approved successfully.",
    };
  } catch (error) {
    return getErrorState(
      error,
      "Something went wrong while approving the therapist profile.",
    );
  }
}

export async function rejectTherapistAction(
  _prevState: AdminTherapistReviewActionState,
  formData: FormData,
): Promise<AdminTherapistReviewActionState> {
  const user = await getCurrentUser();
  const therapistProfileId = getTherapistProfileId(formData);
  const rejectionReason = String(formData.get("rejectionReason") ?? "");

  try {
    assertActionRole(
      user,
      [UserRole.ADMIN],
      "Only admin accounts can reject therapist profiles.",
    );

    if (!therapistProfileId) {
      return {
        status: "error",
        message: "Therapist profile identifier is missing.",
      };
    }

    await rejectTherapistReview(user.id, therapistProfileId, rejectionReason);
    revalidatePath("/admin/therapists");
    revalidatePath("/admin/dashboard");
    revalidatePath("/therapist/onboarding");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: "Therapist profile rejected successfully.",
    };
  } catch (error) {
    return getErrorState(
      error,
      "Something went wrong while rejecting the therapist profile.",
    );
  }
}
