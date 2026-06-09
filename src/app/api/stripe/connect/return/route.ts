import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import { ActionPermissionError, hasRole, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import {
  syncTherapistStripeAccountStatus,
  StripeConnectServiceError,
} from "@/server/services/stripe-connect.service";

export const runtime = "nodejs";

function buildAppUrl(request: NextRequest, pathname: string) {
  return new URL(pathname, request.url);
}

function buildStripeRedirect(request: NextRequest, status: "success" | "error", message: string) {
  const redirectUrl = buildAppUrl(request, "/therapist/payout-details");
  redirectUrl.searchParams.set("stripe_status", status);
  redirectUrl.searchParams.set("stripe_message", message);
  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(buildAppUrl(request, AUTH_ROUTES.login));
  }

  if (!hasRole(user.role, [UserRole.THERAPIST])) {
    return NextResponse.redirect(buildAppUrl(request, "/403"));
  }

  try {
    const activeTherapist = await requireActionActiveTherapistFeatures(user);
    const status = await syncTherapistStripeAccountStatus(activeTherapist.id);
    const message = status.isReady
      ? "Stripe account is connected and ready for paid sessions."
      : "Stripe onboarding was saved. Stripe may still require additional details before paid sessions are enabled.";

    return NextResponse.redirect(buildStripeRedirect(request, "success", message));
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.redirect(buildAppUrl(request, THERAPIST_ONBOARDING_ROUTE));
    }

    const message =
      error instanceof StripeConnectServiceError && error.code === "STRIPE_NOT_CONFIGURED"
        ? "Stripe Connect is not configured yet."
        : "Unable to refresh Stripe account status.";

    return NextResponse.redirect(buildStripeRedirect(request, "error", message));
  }
}
