"use server";

import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { resetPasswordSchema } from "@/lib/validations/auth";
import {
  AuthServiceError,
  resetPasswordWithToken,
} from "@/server/services/auth.service";

export type ResetPasswordActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialResetPasswordActionState: ResetPasswordActionState = {
  status: "idle",
};

export async function resetPasswordAction(
  _prevState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: AUTH_MESSAGES.resetPasswordGenericError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await resetPasswordWithToken(parsed.data);

    return {
      status: "success",
      message: AUTH_MESSAGES.resetPasswordSuccess,
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
      message: AUTH_MESSAGES.resetPasswordGenericError,
    };
  }
}
