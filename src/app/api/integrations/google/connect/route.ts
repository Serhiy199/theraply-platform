import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
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

function buildAppUrl(request: NextRequest, pathname: string) {
  return new URL(pathname, request.url);
}

function normalizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/therapist/payout-details";
  }

  return value;
}

function buildTherapistRedirect(request: NextRequest, status: "success" | "error", message: string) {
  const redirectUrl = buildAppUrl(request, "/therapist/payout-details");
  redirectUrl.searchParams.set("gc_status", status);
  redirectUrl.searchParams.set("gc_message", message);
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

  let activeTherapist: Awaited<ReturnType<typeof requireActionActiveTherapistFeatures>>;

  try {
    activeTherapist = await requireActionActiveTherapistFeatures(user);
  } catch (error) {
    if (error instanceof ActionPermissionError) {
      return NextResponse.redirect(buildAppUrl(request, THERAPIST_ONBOARDING_ROUTE));
    }

    throw error;
  }

  const rateLimit = await checkRateLimitPreset(
    RATE_LIMIT_PRESETS.googleCalendarConnect,
    buildUserRateLimitIdentifier({ userId: activeTherapist.id }),
  );

  if (!rateLimit.allowed) {
    return NextResponse.redirect(buildTherapistRedirect(request, "error", AUTH_MESSAGES.rateLimited));
  }

  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get("returnTo"));

  try {
    const consentUrl = await buildTherapistGoogleCalendarConnectUrl(activeTherapist.id, returnTo);
    return NextResponse.redirect(consentUrl);
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
      return NextResponse.redirect(buildTherapistRedirect(request, "error", error.message));
    }

    return NextResponse.redirect(
      buildTherapistRedirect(request, "error", "Unable to start Google Calendar connection."),
    );
  }
}
