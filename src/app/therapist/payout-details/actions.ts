"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import {
  SAFE_ERROR_MESSAGES,
  getSafeGoogleCalendarErrorMessage,
  getSafeTherapistBookingsErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import { googleCalendarSelectionPayloadSchema } from "@/lib/validations/action-payloads";
import { therapistSessionPricePayloadSchema } from "@/lib/validations/therapist-payout";
import {
  GoogleCalendarServiceError,
  updateTherapistSelectedGoogleCalendar,
} from "@/server/services/google-calendar.service";
import {
  TherapistBookingsServiceError,
  updateTherapistSessionPrice,
} from "@/server/services/therapist-bookings.service";

export type PayoutDetailsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export type GoogleCalendarSelectionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function payoutDetailsAction(
  _prevState: PayoutDetailsActionState,
  formData: FormData,
): Promise<PayoutDetailsActionState> {
  const user = await getCurrentUser();
  const parsed = therapistSessionPricePayloadSchema.safeParse({
    sessionPriceGbp: formData.get("sessionPriceGbp") ?? "",
  });

  try {
    const activeTherapist = await requireActionActiveTherapistFeatures(
      user,
      "Only therapist accounts can update payout details.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message: "Please enter a valid session price.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    await updateTherapistSessionPrice(activeTherapist.id, parsed.data.sessionPriceGbp);

    revalidatePath("/therapist/payout-details");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: "Session price saved successfully.",
    };
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return {
        status: "error",
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof TherapistBookingsServiceError) {
      return {
        status: "error",
        message: getSafeTherapistBookingsErrorMessage(error.code),
      };
    }

    return {
      status: "error",
      message: "Something went wrong while saving payout details.",
    };
  }
}

export async function googleCalendarSelectionAction(
  _prevState: GoogleCalendarSelectionActionState,
  formData: FormData,
): Promise<GoogleCalendarSelectionActionState> {
  const user = await getCurrentUser();
  const parsed = googleCalendarSelectionPayloadSchema.safeParse({
    googleCalendarId: formData.get("googleCalendarId"),
  });

  try {
    const activeTherapist = await requireActionActiveTherapistFeatures(
      user,
      "Only therapist accounts can choose the target Google Calendar.",
    );

    if (!parsed.success) {
      return {
        status: "error",
        message:
          parsed.error.flatten().fieldErrors.googleCalendarId?.[0] ??
          "Choose a Google Calendar first.",
      };
    }

    await updateTherapistSelectedGoogleCalendar(activeTherapist.id, parsed.data.googleCalendarId);

    revalidatePath("/therapist/payout-details");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: "Target Google Calendar saved successfully.",
    };
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return {
        status: "error",
        message: SAFE_ERROR_MESSAGES.permissionDenied,
      };
    }

    if (error instanceof GoogleCalendarServiceError) {
      return {
        status: "error",
        message: getSafeGoogleCalendarErrorMessage(error.code),
      };
    }

    return {
      status: "error",
      message: "Something went wrong while saving the Google Calendar selection.",
    };
  }
}
