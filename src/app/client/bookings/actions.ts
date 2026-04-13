"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
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

  if (!user || user.role !== UserRole.CLIENT) {
    return {
      status: "error",
      message: "You must be signed in as a client to cancel a booking.",
    };
  }

  if (!bookingId) {
    return {
      status: "error",
      message: "Booking identifier is missing.",
    };
  }

  try {
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
