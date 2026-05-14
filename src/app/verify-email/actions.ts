"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import {
  EmailVerificationServiceError,
  resendEmailVerification,
} from "@/server/services/email-verification.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
} from "@/server/services/rate-limit.service";
import type { ResendEmailVerificationActionState } from "@/app/verify-email/state";

export async function resendEmailVerificationAction(
  _prevState: ResendEmailVerificationActionState,
  formData: FormData,
): Promise<ResendEmailVerificationActionState> {
  const currentUser = await getCurrentUser();

  if (currentUser?.id) {
    const rateLimit = await checkRateLimitPreset(
      RATE_LIMIT_PRESETS.authResendVerification,
      buildUserRateLimitIdentifier({ userId: currentUser.id }),
    );

    if (!rateLimit.allowed) {
      return {
        status: "error",
        message: AUTH_MESSAGES.rateLimited,
      };
    }

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

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.authResendVerification,
    buildUserRateLimitIdentifier({ email: parsed.data.email }),
  );

  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: AUTH_MESSAGES.rateLimited,
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
        message: AUTH_MESSAGES.emailVerificationResendGenericError,
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
