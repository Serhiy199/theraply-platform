import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import { ActionPermissionError, hasRole, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import { buildCanonicalAppUrl } from "@/lib/urls/canonical-app-url";
import {
  syncTherapistStripeAccountStatus,
  StripeConnectServiceError,
} from "@/server/services/stripe-connect.service";

export const runtime = "nodejs";

function buildStripeRedirect(status: "success" | "error", message: string) {
  const redirectUrl = buildCanonicalAppUrl("/therapist/payout-details");
  redirectUrl.searchParams.set("stripe_status", status);
  redirectUrl.searchParams.set("stripe_message", message);
  return redirectUrl;
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(buildCanonicalAppUrl(AUTH_ROUTES.login));
  }

  if (!hasRole(user.role, [UserRole.THERAPIST])) {
    return NextResponse.redirect(buildCanonicalAppUrl("/403"));
  }

  try {
    const activeTherapist = await requireActionActiveTherapistFeatures(user);
    const status = await syncTherapistStripeAccountStatus(activeTherapist.id);
    const message = status.isReady
      ? "Stripe account is connected and ready for paid sessions."
      : "Stripe onboarding was saved. Stripe may still require additional details before paid sessions are enabled.";

    return NextResponse.redirect(buildStripeRedirect("success", message));
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.redirect(buildCanonicalAppUrl(THERAPIST_ONBOARDING_ROUTE));
    }

    const message =
      error instanceof StripeConnectServiceError && error.code === "STRIPE_NOT_CONFIGURED"
        ? "Stripe Connect is not configured yet."
        : "Unable to refresh Stripe account status.";

    return NextResponse.redirect(buildStripeRedirect("error", message));
  }
}
