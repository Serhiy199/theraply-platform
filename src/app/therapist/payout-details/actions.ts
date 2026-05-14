"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import { googleCalendarSelectionPayloadSchema } from "@/lib/validations/action-payloads";
import { therapistPayoutDetailsPayloadSchema } from "@/lib/validations/therapist-payout";
import {
  GoogleCalendarServiceError,
  updateTherapistSelectedGoogleCalendar,
} from "@/server/services/google-calendar.service";
import {
  TherapistBookingsServiceError,
  updateTherapistPayoutDetails,
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
  const parsed = therapistPayoutDetailsPayloadSchema.safeParse({
    accountHolderName: formData.get("accountHolderName"),
    bankName: formData.get("bankName") ?? "",
    iban: formData.get("iban") ?? "",
    swift: formData.get("swift") ?? "",
    country: formData.get("country") ?? "",
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
        message: "Please complete the required payout fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    await updateTherapistPayoutDetails(activeTherapist.id, {
      accountHolderName: parsed.data.accountHolderName,
      bankName: parsed.data.bankName,
      iban: parsed.data.iban,
      swift: parsed.data.swift,
      country: parsed.data.country,
      sessionPricePence: parsed.data.sessionPriceGbp,
    });

    revalidatePath("/therapist/payout-details");
    revalidatePath("/therapist/dashboard");

    return {
      status: "success",
      message: "Payout details saved successfully.",
    };
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    if (error instanceof TherapistBookingsServiceError) {
      return {
        status: "error",
        message: error.message,
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
        message: error.message,
      };
    }

    if (error instanceof GoogleCalendarServiceError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "Something went wrong while saving the Google Calendar selection.",
    };
  }
}
