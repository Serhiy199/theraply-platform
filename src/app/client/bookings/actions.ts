"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  ClientBookingsServiceError,
  cancelClientBooking,
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

    await cancelClientBooking(user.id, bookingId);

    revalidatePath("/client/bookings");
    revalidatePath(`/client/bookings/${bookingId}`);
    revalidatePath("/client/dashboard");
    revalidatePath("/client/payments");

    return {
      status: "success",
      message: "Booking cancelled successfully.",
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
