"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { BOOKING_FLOW_MESSAGES } from "@/lib/constants/booking-flow";
import {
  SAFE_ERROR_MESSAGES,
  getSafeBookingFlowErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionRole } from "@/lib/permissions";
import { bookingRequestSchema } from "@/lib/validations/booking-flow";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  BookingFlowServiceError,
  createBookingRequest,
} from "@/server/services/booking-flow.service";

export type BookingRequestActionState = {
  status: "idle" | "success" | "error";
  code?: "validation" | "conflict" | "permission" | "unknown";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function createBookingRequestAction(
  _prevState: BookingRequestActionState,
  formData: FormData,
): Promise<BookingRequestActionState> {
  let bookingId: string | null = null;
  let therapistId: string | null = null;

  try {
    const user = await requireActionRole(
      [UserRole.CLIENT],
      "Only client accounts can create booking requests.",
    );

    const parsed = bookingRequestSchema.safeParse({
      therapistId: String(formData.get("therapistId") ?? ""),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      notes: formData.get("notes") ?? "",
    });

    if (!parsed.success) {
      return {
        status: "error",
        code: "validation",
        message: BOOKING_FLOW_MESSAGES.slotRequired,
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const booking = await createBookingRequest(user.id, parsed.data);
    bookingId = booking.id;
    therapistId = parsed.data.therapistId;
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return {
        status: "error",
        code: "permission",
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof BookingFlowServiceError) {
      return {
        status: "error",
        code:
          error.code === "SLOT_CONFLICT"
            ? "conflict"
            : error.code === "BOOKING_LEAD_TIME"
              ? "validation"
              : "unknown",
        message: getSafeBookingFlowErrorMessage(error.code),
      };
    }

    // Raw exceptions may contain credentials or request contents.
    logDiagnosticEvent("booking-request-action", "Booking creation was not confirmed.", {
      phase: "creation",
      outcome: "not_confirmed",
    });

    return {
      status: "error",
      code: "unknown",
      message: "Something went wrong while creating the booking request.",
    };
  }

  if (!bookingId || !therapistId) {
    return {
      status: "error",
      code: "unknown",
      message: "Something went wrong while creating the booking request.",
    };
  }

  // Creation has committed; cache failures must not turn it into a failed request.
  for (const path of [
    "/client/bookings",
    "/client/dashboard",
    `/client/book/${therapistId}`,
    "/therapist/requests",
    "/therapist/dashboard",
    "/admin/bookings",
    "/admin/dashboard",
  ]) {
    try {
      revalidatePath(path);
    } catch {
      logDiagnosticEvent("booking-request-action", "Booking created but cache invalidation failed.", {
        bookingId,
        phase: "post_commit_revalidation",
        path,
      });
    }
  }

  redirect(`/client/bookings/${bookingId}`);
}
