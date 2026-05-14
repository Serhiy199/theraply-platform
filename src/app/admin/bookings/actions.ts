"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import {
  SAFE_ERROR_MESSAGES,
  getSafeAdminOperationErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionRole } from "@/lib/permissions";
import { adminCancelBookingPayloadSchema } from "@/lib/validations/action-payloads";
import {
  AdminOperationsServiceError,
  adminCancelBooking,
  type AdminBookingCancellationResult,
} from "@/server/services/admin-operations.service";

export type AdminCancelBookingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function adminCancelBookingAction(
  _prevState: AdminCancelBookingActionState,
  formData: FormData,
): Promise<AdminCancelBookingActionState> {
  const parsed = adminCancelBookingPayloadSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });

  try {
    const user = await requireActionRole(
      [UserRole.ADMIN],
      "Only admin accounts can cancel bookings manually from the admin panel.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: parsed.error.flatten().fieldErrors.bookingId?.[0] ?? "Booking identifier is missing.",
      };
    }

    const { bookingId } = parsed.data;
    const cancellationResult = await adminCancelBooking(user.id, bookingId);

    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/payments");
    revalidatePath("/client/bookings");
    revalidatePath("/client/dashboard");
    revalidatePath("/client/payments");
    revalidatePath("/therapist/requests");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: getAdminCancellationSuccessMessage(cancellationResult),
    };
  } catch (error) {
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
      message: "Something went wrong while cancelling the booking.",
    };
  }
}

function getAdminCancellationSuccessMessage(result: AdminBookingCancellationResult) {
  if (result.refund.status === "refunded") {
    return "Booking cancelled successfully by admin and the Stripe refund was created.";
  }

  return "Booking cancelled successfully by admin.";
}
