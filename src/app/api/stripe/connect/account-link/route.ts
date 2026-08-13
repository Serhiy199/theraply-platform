import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { ActionPermissionError, hasRole, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import { buildCanonicalAppUrl } from "@/lib/urls/canonical-app-url";
import {
  createTherapistStripeAccountLink,
  StripeConnectServiceError,
} from "@/server/services/stripe-connect.service";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
} from "@/server/services/rate-limit.service";

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

  let activeTherapist: Awaited<ReturnType<typeof requireActionActiveTherapistFeatures>>;

  try {
    activeTherapist = await requireActionActiveTherapistFeatures(user);
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.redirect(buildCanonicalAppUrl(THERAPIST_ONBOARDING_ROUTE));
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.stripeConnect,
    buildUserRateLimitIdentifier({ userId: activeTherapist.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.redirect(buildStripeRedirect("error", AUTH_MESSAGES.rateLimited));
  }

  try {
    const accountLink = await createTherapistStripeAccountLink(activeTherapist.id);
    return NextResponse.redirect(accountLink.url);
  } catch (error) {
    await createAuditLogEntryBestEffort({
      actorUserId: activeTherapist.id,
      entityType: "StripeConnect",
      entityId: activeTherapist.id,
      action: "STRIPE_CONNECT_ACCOUNT_LINK_ROUTE_FAILED",
      after: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logDiagnosticEvent("stripe-connect-account-link-route", "Unable to start Stripe Connect onboarding.", {
      therapistUserId: activeTherapist.id,
      error: error instanceof Error ? error.message : String(error),
    });

    const message =
      error instanceof StripeConnectServiceError && error.code === "STRIPE_NOT_CONFIGURED"
        ? "Stripe Connect is not configured yet."
        : "Something went wrong while starting Stripe onboarding.";

    return NextResponse.redirect(buildStripeRedirect("error", message));
  }
}
