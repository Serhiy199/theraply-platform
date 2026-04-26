"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  ClientBookingsServiceError,
  cancelClientBooking,
  type ClientBookingCancellationResult,
} from "@/server/services/client-bookings.service";

export type CancelBookingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialCancelBookingActionState: CancelBookingActionState = {
  status: "idle",
};

export async function cancelBookingAction(
  _prevState: CancelBookingActionState,
  formData: FormData,
): Promise<CancelBookingActionState> {
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const user = await getCurrentUser();

  try {
    assertActionRole(user, [UserRole.CLIENT], "Only client accounts can cancel client bookings.");

    if (!bookingId) {
      return {
        status: "error",
        message: "Booking identifier is missing.",
      };
    }

    const cancellationResult = await cancelClientBooking(user.id, bookingId);

    revalidatePath("/client/bookings");
    revalidatePath(`/client/bookings/${bookingId}`);
    revalidatePath("/client/dashboard");
    revalidatePath("/client/payments");
    revalidatePath("/therapist/requests");
    revalidatePath("/therapist/dashboard");
    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/payments");

    return {
      status: "success",
      message: getClientCancellationSuccessMessage(cancellationResult),
    };
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    if (error instanceof ClientBookingsServiceError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "Something went wrong while cancelling the booking.",
    };
  }
}

function getClientCancellationSuccessMessage(result: ClientBookingCancellationResult) {
  if (result.refund.status === "refunded") {
    return "Booking cancelled successfully and the Stripe refund was created.";
  }

  if (result.refund.reason === "LATE_CANCELLATION_POLICY") {
    return "Booking cancelled successfully. Because this was less than 24 hours before the session, the payment was not refunded.";
  }

  return "Booking cancelled successfully.";
}
