"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  BookingFlowServiceError,
  cancelConfirmedBookingByTherapist,
  confirmBookingRequest,
  rejectBookingRequest,
} from "@/server/services/booking-flow.service";

export type RequestDecisionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type TherapistCancelSessionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function revalidateTherapistBookingPaths(bookingId: string) {
  revalidatePath("/therapist/requests");
  revalidatePath(`/therapist/requests/${bookingId}`);
  revalidatePath("/therapist/dashboard");
  revalidatePath("/therapist/clients");
  revalidatePath("/client/bookings");
  revalidatePath(`/client/bookings/${bookingId}`);
  revalidatePath("/client/dashboard");
  revalidatePath("/client/payments");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/payments");
}

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

    revalidateTherapistBookingPaths(bookingId);

    return {
      status: "success",
      message:
        intent === "confirm"
          ? "Booking confirmed successfully."
          : "Booking rejected successfully.",
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

export async function therapistCancelSessionAction(
  _prevState: TherapistCancelSessionActionState,
  formData: FormData,
): Promise<TherapistCancelSessionActionState> {
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const user = await getCurrentUser();

  try {
    assertActionRole(
      user,
      [UserRole.THERAPIST],
      "Only therapist accounts can cancel confirmed sessions from the therapist area.",
    );

    if (!bookingId) {
      return {
        status: "error",
        message: "Booking identifier is missing.",
      };
    }

    const booking = await cancelConfirmedBookingByTherapist(user.id, bookingId);

    revalidateTherapistBookingPaths(bookingId);

    return {
      status: "success",
      message:
        booking.payment?.paymentStatus === "PAID"
          ? "Session cancelled successfully. The client can now choose refund or platform credit from their booking page."
          : "Session cancelled successfully.",
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
      message: "Something went wrong while cancelling the confirmed session.",
    };
  }
}
