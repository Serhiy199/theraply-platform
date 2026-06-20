"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { ActionPermissionError, requireActionRole } from "@/lib/permissions";
import {
  SAFE_ERROR_MESSAGES,
  getSafeClientBookingErrorMessage,
} from "@/lib/errors/safe-error-messages";
import {
  bookingIdPayloadSchema,
  clientCompensationPayloadSchema,
} from "@/lib/validations/action-payloads";
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
  const parsed = bookingIdPayloadSchema.safeParse({
    bookingId: formData.get("bookingId"),
  });

  try {
    const user = await requireActionRole(
      [UserRole.CLIENT],
      "Only client accounts can cancel client bookings.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: parsed.error.flatten().fieldErrors.bookingId?.[0] ?? "Booking identifier is missing.",
      };
    }

    const { bookingId } = parsed.data;
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
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof ClientBookingsServiceError) {
      return {
        status: "error",
        message: getSafeClientBookingErrorMessage(error.code),
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
  const parsed = clientCompensationPayloadSchema.safeParse({
    bookingId: formData.get("bookingId"),
    resolution: formData.get("resolution"),
  });

  try {
    const user = await requireActionRole(
      [UserRole.CLIENT],
      "Only client accounts can resolve compensation for cancelled bookings.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: "Compensation action payload is incomplete.",
      };
    }

    const { bookingId, resolution } = parsed.data;
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
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof ClientBookingsServiceError) {
      return {
        status: "error",
        message: getSafeClientBookingErrorMessage(error.code),
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
    if (result.transfer?.status === "transferred") {
      return "Booking cancelled successfully. Because this was less than 24 hours before the session, the payment was not refunded and the therapist settlement has started.";
    }

    if (result.transfer?.status === "failed") {
      return "Booking cancelled successfully. Because this was less than 24 hours before the session, the payment was not refunded. Therapist settlement will be retried by the platform.";
    }

    return "Booking cancelled successfully. Because this was less than 24 hours before the session, the payment was not refunded and therapist settlement is pending.";
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
