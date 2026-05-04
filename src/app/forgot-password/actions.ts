"use server";

import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import {
  AuthServiceError,
  requestPasswordReset,
} from "@/server/services/auth.service";
import type { ForgotPasswordActionState } from "@/app/forgot-password/state";

export async function forgotPasswordAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: AUTH_MESSAGES.forgotPasswordGenericError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await requestPasswordReset(parsed.data);

    return {
      status: "success",
      message: AUTH_MESSAGES.forgotPasswordSuccess,
    };
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: AUTH_MESSAGES.forgotPasswordGenericError,
    };
  }
}
