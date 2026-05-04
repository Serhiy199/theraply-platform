"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import {
  EmailVerificationServiceError,
  resendEmailVerification,
} from "@/server/services/email-verification.service";
import type { ResendEmailVerificationActionState } from "@/app/verify-email/state";

export async function resendEmailVerificationAction(
  _prevState: ResendEmailVerificationActionState,
  formData: FormData,
): Promise<ResendEmailVerificationActionState> {
  const currentUser = await getCurrentUser();

  if (currentUser?.id) {
    return resendForUserId(currentUser.id);
  }

  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: AUTH_MESSAGES.emailVerificationResendGenericError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  return resendForEmail(parsed.data.email);
}

async function resendForUserId(userId: string): Promise<ResendEmailVerificationActionState> {
  try {
    await resendEmailVerification({ userId });

    return {
      status: "success",
      message: AUTH_MESSAGES.emailVerificationResendSuccess,
    };
  } catch (error) {
    if (error instanceof EmailVerificationServiceError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: AUTH_MESSAGES.emailVerificationResendGenericError,
    };
  }
}

async function resendForEmail(email: string): Promise<ResendEmailVerificationActionState> {
  try {
    await resendEmailVerification({ email });

    return {
      status: "success",
      message: AUTH_MESSAGES.emailVerificationResendSuccess,
    };
  } catch {
    return {
      status: "error",
      message: AUTH_MESSAGES.emailVerificationResendGenericError,
    };
  }
}
