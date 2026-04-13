"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import {
  TherapistBookingsServiceError,
  confirmTherapistBooking,
  rejectTherapistBooking,
} from "@/server/services/therapist-bookings.service";

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

  if (!user || user.role !== UserRole.THERAPIST) {
    return {
      status: "error",
      message: "You must be signed in as a therapist to manage booking requests.",
    };
  }

  if (!bookingId || (intent !== "confirm" && intent !== "reject")) {
    return {
      status: "error",
      message: "Request action payload is incomplete.",
    };
  }

  try {
    if (intent === "confirm") {
      await confirmTherapistBooking(user.id, bookingId);
    } else {
      await rejectTherapistBooking(user.id, bookingId);
    }

    revalidatePath("/therapist/requests");
    revalidatePath(`/therapist/requests/${bookingId}`);
    revalidatePath("/therapist/dashboard");
    revalidatePath("/therapist/clients");

    return {
      status: "success",
      message: intent === "confirm" ? "Booking confirmed successfully." : "Booking rejected successfully.",
    };
  } catch (error) {
    if (error instanceof TherapistBookingsServiceError) {
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
