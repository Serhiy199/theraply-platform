"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  BookingFlowServiceError,
  confirmBookingRequest,
  rejectBookingRequest,
} from "@/server/services/booking-flow.service";

export type RequestDecisionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialRequestDecisionActionState: RequestDecisionActionState = {
  status: "idle",
};

export async function requestDecisionAction(
  _prevState: RequestDecisionActionState,
  formData: FormData,
): Promise<RequestDecisionActionState> {
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  const user = await getCurrentUser();

  try {
    assertActionRole(
      user,
      [UserRole.THERAPIST],
      "Only therapist accounts can confirm or reject therapist booking requests.",
    );

    if (!bookingId || (intent !== "confirm" && intent !== "reject")) {
      return {
        status: "error",
        message: "Request action payload is incomplete.",
      };
    }

    if (intent === "confirm") {
      await confirmBookingRequest(user.id, bookingId);
    } else {
      await rejectBookingRequest(user.id, bookingId);
    }

    revalidatePath("/therapist/requests");
    revalidatePath(`/therapist/requests/${bookingId}`);
    revalidatePath("/therapist/dashboard");
    revalidatePath("/therapist/clients");
    revalidatePath("/client/bookings");
    revalidatePath(`/client/bookings/${bookingId}`);
    revalidatePath("/client/dashboard");
    revalidatePath("/admin/bookings");
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/dashboard");

    return {
      status: "success",
      message: intent === "confirm" ? "Booking confirmed successfully." : "Booking rejected successfully.",
    };
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    if (error instanceof BookingFlowServiceError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "Something went wrong while updating the booking request.",
    };
  }
}