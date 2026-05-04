"use server";

import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { registerSchema } from "@/lib/validations/auth";
import { AuthServiceError, registerAccount } from "@/server/services/auth.service";
import type { RegisterActionState } from "@/app/register/state";

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    role: formData.get("role"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: AUTH_MESSAGES.registerGenericError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await registerAccount(parsed.data);

    return {
      status: "success",
      message: AUTH_MESSAGES.registerSuccess,
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
      message: AUTH_MESSAGES.registerGenericError,
    };
  }
}
