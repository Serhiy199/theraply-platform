import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import {
  SAFE_ERROR_MESSAGES,
  getSafePaymentFlowErrorMessage,
} from "@/lib/errors/safe-error-messages";
import { ActionPermissionError, requireCurrentActionRole } from "@/lib/permissions";
import { promoCodePreviewRequestSchema } from "@/lib/validations/payments";
import {
  PaymentFlowServiceError,
  previewClientPromoCode,
} from "@/server/services/payment-flow.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
  getRateLimitHeaders,
} from "@/server/services/rate-limit.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  let user: Awaited<ReturnType<typeof requireCurrentActionRole>>;

  try {
    user = await requireCurrentActionRole(
      currentUser,
      [UserRole.CLIENT],
      "Only client accounts can preview a promo code.",
    );
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.json(
        { error: SAFE_ERROR_MESSAGES.permissionDenied },
        { status: 403 },
      );
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.promoCodePreview,
    buildUserRateLimitIdentifier({ userId: user.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: AUTH_MESSAGES.rateLimited },
      { status: 429, headers: getRateLimitHeaders(rateLimit) },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = promoCodePreviewRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Promo preview request is invalid.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await previewClientPromoCode(user.id, parsed.data),
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof PaymentFlowServiceError) {
      const status =
        error.code === "BOOKING_NOT_FOUND"
          ? 404
          : error.code === "PROMO_CODE_INVALID"
            ? 422
            : 409;

      return NextResponse.json(
        { error: getSafePaymentFlowErrorMessage(error.code), code: error.code },
        { status },
      );
    }

    return NextResponse.json(
      { error: "Something went wrong while checking the promo code." },
      { status: 500 },
    );
  }
}
