import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { AUTH_MESSAGES, AUTH_ROUTES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";
import { ActionPermissionError, hasRole, requireActionActiveTherapistFeatures } from "@/lib/permissions";
import { parseGoogleOAuthState } from "@/lib/google/google-oauth";
import {
  GoogleCalendarServiceError,
  completeTherapistGoogleCalendarConnection,
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

function normalizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) {
    return "/therapist/payout-details";
  }

  return value;
}

function buildReturnRedirect(
  request: NextRequest,
  returnTo: string,
  status: "success" | "error",
  message: string,
) {
  const redirectUrl = buildAppUrl(request, returnTo);
  redirectUrl.searchParams.set("gc_status", status);
  redirectUrl.searchParams.set("gc_message", message);
  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const defaultReturnTo = "/therapist/payout-details";

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
    return NextResponse.redirect(
      buildReturnRedirect(request, defaultReturnTo, "error", AUTH_MESSAGES.rateLimited),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  if (!state) {
    return NextResponse.redirect(
      buildReturnRedirect(request, defaultReturnTo, "error", "Google callback is missing state."),
    );
  }

  try {
    const parsedState = parseGoogleOAuthState(state);
    const returnTo = normalizeReturnTo(parsedState.returnTo);

    if (parsedState.therapistUserId !== activeTherapist.id) {
      await createAuditLogEntryBestEffort({
        actorUserId: activeTherapist.id,
        entityType: "GoogleCalendarIntegration",
        entityId: parsedState.therapistUserId,
        action: "GOOGLE_CALENDAR_CALLBACK_USER_MISMATCH",
        after: {
          signedInUserId: activeTherapist.id,
          stateTherapistUserId: parsedState.therapistUserId,
        },
      });

      return NextResponse.redirect(
        buildReturnRedirect(
          request,
          returnTo,
          "error",
          "Google Calendar callback does not match the signed-in therapist.",
        ),
      );
    }

    if (oauthError) {
      await createAuditLogEntryBestEffort({
        actorUserId: activeTherapist.id,
        entityType: "GoogleCalendarIntegration",
        entityId: activeTherapist.id,
        action: "GOOGLE_CALENDAR_CALLBACK_DENIED",
        after: {
          returnTo,
          oauthError,
        },
      });

      return NextResponse.redirect(
        buildReturnRedirect(
          request,
          returnTo,
          "error",
          "Google authorization was cancelled or denied.",
        ),
      );
    }

    if (!code) {
      await createAuditLogEntryBestEffort({
        actorUserId: activeTherapist.id,
        entityType: "GoogleCalendarIntegration",
        entityId: activeTherapist.id,
        action: "GOOGLE_CALENDAR_CALLBACK_CODE_MISSING",
        after: {
          returnTo,
        },
      });

      return NextResponse.redirect(
        buildReturnRedirect(
          request,
          returnTo,
          "error",
          "Google callback did not include an authorization code.",
        ),
      );
    }

    const connection = await completeTherapistGoogleCalendarConnection(activeTherapist.id, code);
    const successMessage = connection.googleCalendarEmail
      ? `Connected ${connection.googleCalendarEmail} successfully.`
      : "Google Calendar connected successfully.";

    return NextResponse.redirect(
      buildReturnRedirect(request, returnTo, "success", successMessage),
    );
  } catch (error) {
    await createAuditLogEntryBestEffort({
      actorUserId: activeTherapist.id,
      entityType: "GoogleCalendarIntegration",
      entityId: activeTherapist.id,
      action: "GOOGLE_CALENDAR_CALLBACK_FAILED",
      after: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logDiagnosticEvent("google-calendar-callback-route", "Unable to complete Google Calendar connection.", {
      therapistUserId: activeTherapist.id,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof GoogleCalendarServiceError) {
      return NextResponse.redirect(
        buildReturnRedirect(request, defaultReturnTo, "error", error.message),
      );
    }

    return NextResponse.redirect(
      buildReturnRedirect(
        request,
        defaultReturnTo,
        "error",
        "Unable to complete Google Calendar connection.",
      ),
    );
  }
}
