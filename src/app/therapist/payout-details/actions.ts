"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionPermissionError, assertActionRole } from "@/lib/permissions";
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

export const initialPayoutDetailsActionState: PayoutDetailsActionState = {
  status: "idle",
};

export type GoogleCalendarSelectionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialGoogleCalendarSelectionActionState: GoogleCalendarSelectionActionState = {
  status: "idle",
};

export async function payoutDetailsAction(
  _prevState: PayoutDetailsActionState,
  formData: FormData,
): Promise<PayoutDetailsActionState> {
  const user = await getCurrentUser();

  try {
    assertActionRole(
      user,
      [UserRole.THERAPIST],
      "Only therapist accounts can update payout details.",
    );

    const accountHolderName = String(formData.get("accountHolderName") ?? "").trim();
    const bankName = String(formData.get("bankName") ?? "").trim();
    const iban = String(formData.get("iban") ?? "").trim();
    const swift = String(formData.get("swift") ?? "").trim();
    const country = String(formData.get("country") ?? "").trim();
    const sessionPriceGbp = String(formData.get("sessionPriceGbp") ?? "").trim();

    if (!accountHolderName) {
      return {
        status: "error",
        message: "Please complete the required payout fields.",
        fieldErrors: {
          accountHolderName: ["Account holder name is required."],
        },
      };
    }

    let sessionPricePence: number | null = null;

    if (sessionPriceGbp) {
      const normalizedSessionPrice = sessionPriceGbp.replace(",", ".");
      const parsedSessionPrice = Number(normalizedSessionPrice);

      if (!Number.isFinite(parsedSessionPrice) || parsedSessionPrice <= 0) {
        return {
          status: "error",
          message: "Please enter a valid session price in GBP.",
          fieldErrors: {
            sessionPriceGbp: ["Session price must be greater than 0."],
          },
        };
      }

      sessionPricePence = Math.round(parsedSessionPrice * 100);
    }

    await updateTherapistPayoutDetails(user.id, {
      accountHolderName,
      bankName,
      iban,
      swift,
      country,
      sessionPricePence,
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

  try {
    assertActionRole(
      user,
      [UserRole.THERAPIST],
      "Only therapist accounts can choose the target Google Calendar.",
    );

    const googleCalendarId = String(formData.get("googleCalendarId") ?? "").trim();

    await updateTherapistSelectedGoogleCalendar(user.id, googleCalendarId);

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
