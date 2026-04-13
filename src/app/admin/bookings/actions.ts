"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  AdminOperationsServiceError,
  adminCancelBooking,
} from "@/server/services/admin-operations.service";

export type AdminCancelBookingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialAdminCancelBookingActionState: AdminCancelBookingActionState = {
  status: "idle",
};

export async function adminCancelBookingAction(
  _prevState: AdminCancelBookingActionState,
  formData: FormData,
): Promise<AdminCancelBookingActionState> {
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const user = await getCurrentUser();

  try {
    assertActionRole(
      user,
      [UserRole.ADMIN],
      "Only admin accounts can cancel bookings manually from the admin panel.",
    );

    if (!bookingId) {
      return {
        status: "error",
        message: "Booking identifier is missing.",
      };
    }

    await adminCancelBooking(user.id, bookingId);

    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/dashboard");
    revalidatePath("/client/bookings");
    revalidatePath("/client/dashboard");
    revalidatePath("/therapist/requests");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: "Booking cancelled successfully by admin.",
    };
  } catch (error) {
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
      message: "Something went wrong while cancelling the booking.",
    };
  }
}
