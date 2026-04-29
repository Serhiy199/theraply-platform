"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
import {
  cancelClientBooking,
  ClientBookingsServiceError,
  resolveClientCancellationCompensation,
  type ClientBookingCancellationResult,
  type ClientCompensationResolutionResult,
} from "@/server/services/client-bookings.service";

export type CancelBookingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type ResolveCompensationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function revalidateClientBookingPaths(bookingId: string) {
  revalidatePath("/client/bookings");
  revalidatePath(`/client/bookings/${bookingId}`);
  revalidatePath("/client/dashboard");
  revalidatePath("/client/payments");
  revalidatePath("/therapist/requests");
  revalidatePath("/therapist/dashboard");
  revalidatePath("/therapist/clients");
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/payments");
}

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

    revalidateClientBookingPaths(bookingId);

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

export async function resolveCompensationAction(
  _prevState: ResolveCompensationActionState,
  formData: FormData,
): Promise<ResolveCompensationActionState> {
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const resolution = String(formData.get("resolution") ?? "").trim();
  const user = await getCurrentUser();

  try {
    assertActionRole(
      user,
      [UserRole.CLIENT],
      "Only client accounts can resolve compensation for cancelled bookings.",
    );

    if (!bookingId || (resolution !== "refund" && resolution !== "credit")) {
      return {
        status: "error",
        message: "Compensation action payload is incomplete.",
      };
    }

    const result = await resolveClientCancellationCompensation(
      user.id,
      bookingId,
      resolution,
    );

    revalidateClientBookingPaths(bookingId);

    return {
      status: "success",
      message: getCompensationResolutionSuccessMessage(result),
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
      message: "Something went wrong while resolving compensation for this cancellation.",
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

function getCompensationResolutionSuccessMessage(
  result: ClientCompensationResolutionResult,
) {
  if (result.resolution === "refund") {
    return "Refund selected successfully. The Stripe refund has been created for this cancelled session.";
  }

  return "Credit selected successfully. The full session value has been added to your account balance for a future booking.";
}
