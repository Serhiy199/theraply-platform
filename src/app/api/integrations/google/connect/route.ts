import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_STATE_TTL_SECONDS, safeGoogleReturnTo } from "@/lib/google/google-oauth-state";
import { issueGoogleOAuthState, googleStateCookieName } from "@/server/services/google-oauth-state.service";
import { getCurrentUser } from "@/lib/auth/session";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { getSafeGoogleCalendarErrorMessage } from "@/lib/errors/safe-error-messages";
import { buildCanonicalAppUrl } from "@/lib/urls/canonical-app-url";
import { ActionPermissionError, hasRole, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import {
  GoogleCalendarServiceError,
  buildTherapistGoogleCalendarConnectUrl,
} from "@/server/services/google-calendar.service";
import {
  createAuditLogEntryBestEffort,
  logDiagnosticEvent,
} from "@/server/services/audit-log.service";
import {
  buildUserRateLimitIdentifier,
  checkRateLimitPreset,
} from "@/server/services/rate-limit.service";

function buildTherapistRedirect(status: "success" | "error", message: string) {
  const redirectUrl = buildCanonicalAppUrl("/therapist/payout-details");
  redirectUrl.searchParams.set("gc_status", status);
  redirectUrl.searchParams.set("gc_message", message);
  return redirectUrl;
}

export async function GET(request: NextRequest) {
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
    RATE_LIMIT_PRESETS.googleCalendarConnect,
    buildUserRateLimitIdentifier({ userId: activeTherapist.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.redirect(buildTherapistRedirect("error", AUTH_MESSAGES.rateLimited));
  }

  const returnTo = safeGoogleReturnTo(request.nextUrl.searchParams.get("returnTo"));

  try {
    const challenge = issueGoogleOAuthState(request, activeTherapist.id, returnTo);
    const consentUrl = await buildTherapistGoogleCalendarConnectUrl(activeTherapist.id, returnTo, challenge.state);
    const response = NextResponse.redirect(consentUrl);
    response.cookies.set(googleStateCookieName(), challenge.nonce, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: "/", maxAge: GOOGLE_STATE_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    await createAuditLogEntryBestEffort({
      actorUserId: activeTherapist.id,
      entityType: "GoogleCalendarIntegration",
      entityId: activeTherapist.id,
      action: "GOOGLE_CALENDAR_CONNECT_ROUTE_FAILED",
      after: {
        returnTo,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logDiagnosticEvent("google-calendar-connect-route", "Unable to start Google Calendar connection.", {
      therapistUserId: activeTherapist.id,
      returnTo,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof GoogleCalendarServiceError) {
      return NextResponse.redirect(
        buildTherapistRedirect("error", getSafeGoogleCalendarErrorMessage(error.code)),
      );
    }

    return NextResponse.redirect(
      buildTherapistRedirect("error", "Unable to start Google Calendar connection."),
    );
  }
}
