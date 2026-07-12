"use server";

import { UserRole } from "@prisma/client";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { getSafeAuthErrorMessage } from "@/lib/errors/safe-error-messages";
import { requireActionRole } from "@/lib/permissions";
import { changePasswordSchema } from "@/lib/validations/auth";
import {
  AuthServiceError,
  changePasswordForUser,
} from "@/server/services/auth.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
} from "@/server/services/rate-limit.service";
import type { ChangePasswordActionState } from "@/app/change-password/state";

export async function changePasswordAction(
  _prevState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const user = await requireActionRole([UserRole.CLIENT, UserRole.THERAPIST, UserRole.ADMIN]);
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: AUTH_MESSAGES.changePasswordGenericError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.authChangePassword,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: AUTH_MESSAGES.rateLimited,
    };
  }

  try {
    await changePasswordForUser(user.id, parsed.data);

    return {
      status: "success",
      message: AUTH_MESSAGES.changePasswordSuccess,
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
      message: AUTH_MESSAGES.changePasswordGenericError,
    };
  }
}
