"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import {
  SAFE_ERROR_MESSAGES,
  getSafeAdminOperationErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionRole } from "@/lib/permissions";
import {
  therapistRejectReviewPayloadSchema,
  therapistReviewPayloadSchema,
} from "@/lib/validations/action-payloads";
import {
  AdminOperationsServiceError,
  approveTherapistReview,
  rejectTherapistReview,
} from "@/server/services/admin-operations.service";

export type AdminTherapistReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  wixSyncStatus?: "synced" | "failed";
};

function getErrorState(
  error: unknown,
  fallbackMessage: string,
): AdminTherapistReviewActionState {
  if (error instanceof ActionPermissionError) {
    return {
      status: "error",
      message: SAFE_ERROR_MESSAGES.permissionDenied,
    };
  }

  if (error instanceof AdminOperationsServiceError) {
    return {
      status: "error",
      message: getSafeAdminOperationErrorMessage(error.code),
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
  const parsed = therapistReviewPayloadSchema.safeParse({
    therapistProfileId: formData.get("therapistProfileId"),
  });

  let wixSyncStatus: "synced" | "failed";

  try {
    const user = await requireActionRole(
      [UserRole.ADMIN],
      "Only admin accounts can approve therapist profiles.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.flatten().fieldErrors.therapistProfileId?.[0] ??
          "Therapist profile identifier is missing.",
      };
    }

    const { therapistProfileId } = parsed.data;
    const result = await approveTherapistReview(user.id, therapistProfileId);
    wixSyncStatus = result.wixSync.status;
    revalidatePath("/admin/therapists");
    revalidatePath("/admin/dashboard");
    revalidatePath("/therapist/onboarding");
    revalidatePath("/therapist/dashboard");

  } catch (error) {
    return getErrorState(
      error,
      "Something went wrong while approving the therapist profile.",
    );
  }

  redirect(`/admin/therapists?wixSync=${wixSyncStatus}`);
}

export async function rejectTherapistAction(
  _prevState: AdminTherapistReviewActionState,
  formData: FormData,
): Promise<AdminTherapistReviewActionState> {
  const parsed = therapistRejectReviewPayloadSchema.safeParse({
    therapistProfileId: formData.get("therapistProfileId"),
    rejectionReason: formData.get("rejectionReason"),
  });

  try {
    const user = await requireActionRole(
      [UserRole.ADMIN],
      "Only admin accounts can reject therapist profiles.",
    );

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return {
        status: "error",
        message:
          fieldErrors.therapistProfileId?.[0] ??
          fieldErrors.rejectionReason?.[0] ??
          "Therapist review payload is incomplete.",
      };
    }

    const { therapistProfileId, rejectionReason } = parsed.data;
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
