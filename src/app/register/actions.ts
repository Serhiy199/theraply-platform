"use server";

import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { getSafeAuthErrorMessage } from "@/lib/errors/safe-error-messages";
import { registerSchema } from "@/lib/validations/auth";
import { AuthServiceError, registerAccount } from "@/server/services/auth.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
} from "@/server/services/rate-limit.service";
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

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.authRegister,
    buildUserRateLimitIdentifier({ email: parsed.data.email }),
  );

  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: AUTH_MESSAGES.rateLimited,
    };
  }

  try {
    await registerAccount(parsed.data);

    return {
      status: "success",
      message: AUTH_MESSAGES.registerSuccess,
      email: parsed.data.email,
    };
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return {
        status: "error",
        message: getSafeAuthErrorMessage(error.code),
      };
    }

    return {
      status: "error",
      message: AUTH_MESSAGES.registerGenericError,
    };
  }
}
