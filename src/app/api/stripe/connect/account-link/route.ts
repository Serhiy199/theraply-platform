import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { integrationStartMethodNotAllowed, validateIntegrationStartRequest } from "@/lib/integrations/explicit-start-request";
import { claimIntegrationStart } from "@/server/services/integration-start-claim.service";
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
  return integrationStartMethodNotAllowed();
}

export async function POST(request: NextRequest) {
  const validation = await validateIntegrationStartRequest(request, "stripe-connect");
  if (validation instanceof NextResponse) return validation;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(buildCanonicalAppUrl(AUTH_ROUTES.login), 303);
  }

  if (!hasRole(user.role, [UserRole.THERAPIST])) {
    return NextResponse.redirect(buildCanonicalAppUrl("/403"), 303);
  }

  let activeTherapist: Awaited<ReturnType<typeof requireActionActiveTherapistFeatures>>;

  try {
    activeTherapist = await requireActionActiveTherapistFeatures(user);
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.redirect(buildCanonicalAppUrl(THERAPIST_ONBOARDING_ROUTE), 303);
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.stripeConnect,
    buildUserRateLimitIdentifier({ userId: activeTherapist.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.redirect(buildStripeRedirect("error", AUTH_MESSAGES.rateLimited), 303);
  }

  try {
    if (!await claimIntegrationStart(activeTherapist.id, "stripe-connect", validation.requestId)) {
      return NextResponse.redirect(buildStripeRedirect("error", "This connection request was already started. Reload settings before trying again."), 303);
    }
    const accountLink = await createTherapistStripeAccountLink(activeTherapist.id);
    return NextResponse.redirect(accountLink.url, 303);
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

    return NextResponse.redirect(buildStripeRedirect("error", message), 303);
  }
}
