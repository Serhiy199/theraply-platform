import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import { hasRole } from "@/lib/permissions";
import {
  GoogleCalendarServiceError,
  buildTherapistGoogleCalendarConnectUrl,
} from "@/server/services/google-calendar.service";

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

  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get("returnTo"));

  try {
    const consentUrl = await buildTherapistGoogleCalendarConnectUrl(user.id, returnTo);
    return NextResponse.redirect(consentUrl);
  } catch (error) {
    if (error instanceof GoogleCalendarServiceError) {
      return NextResponse.redirect(buildTherapistRedirect(request, "error", error.message));
    }

    return NextResponse.redirect(
      buildTherapistRedirect(request, "error", "Unable to start Google Calendar connection."),
    );
  }
}
