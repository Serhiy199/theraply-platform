"use server";

import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { getSafeAuthErrorMessage } from "@/lib/errors/safe-error-messages";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import {
  AuthServiceError,
  requestPasswordReset,
} from "@/server/services/auth.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
} from "@/server/services/rate-limit.service";
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

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.authForgotPassword,
    buildUserRateLimitIdentifier({ email: parsed.data.email }),
  );

  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: AUTH_MESSAGES.rateLimited,
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
        message: getSafeAuthErrorMessage(error.code),
      };
    }

    return {
      status: "error",
      message: AUTH_MESSAGES.forgotPasswordGenericError,
    };
  }
}
