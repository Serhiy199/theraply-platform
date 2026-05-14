"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import {
  SAFE_ERROR_MESSAGES,
  getSafeBookingFlowErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import {
  therapistCancelSessionPayloadSchema,
  therapistRequestDecisionPayloadSchema,
} from "@/lib/validations/action-payloads";
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
  const parsed = therapistRequestDecisionPayloadSchema.safeParse({
    bookingId: formData.get("bookingId"),
    intent: formData.get("intent"),
  });
  const user = await getCurrentUser();

  try {
    const activeTherapist = await requireActionActiveTherapistFeatures(
      user,
      "Only therapist accounts can confirm or reject therapist booking requests.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: "Request action payload is incomplete.",
      };
    }

    const { bookingId, intent } = parsed.data;
    if (intent === "confirm") {
      await confirmBookingRequest(activeTherapist.id, bookingId);
    } else {
      await rejectBookingRequest(activeTherapist.id, bookingId);
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
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof BookingFlowServiceError) {
      return {
        status: "error",
        message: getSafeBookingFlowErrorMessage(error.code),
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
  const parsed = therapistCancelSessionPayloadSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });
  const user = await getCurrentUser();

  try {
    const activeTherapist = await requireActionActiveTherapistFeatures(
      user,
      "Only therapist accounts can cancel confirmed sessions from the therapist area.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: parsed.error.flatten().fieldErrors.bookingId?.[0] ?? "Booking identifier is missing.",
      };
    }

    const { bookingId } = parsed.data;
    const booking = await cancelConfirmedBookingByTherapist(activeTherapist.id, bookingId);

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
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof BookingFlowServiceError) {
      return {
        status: "error",
        message: getSafeBookingFlowErrorMessage(error.code),
      };
    }

    return {
      status: "error",
      message: "Something went wrong while cancelling the confirmed session.",
    };
  }
}
