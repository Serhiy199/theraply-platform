import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import {
  buildAuthRouteWithCallback,
  resolveSafeInternalCallbackUrl,
} from "@/lib/auth/redirects";

const ROLE_ROUTE_PREFIXES = {
  CLIENT: "/client",
  THERAPIST: "/therapist",
  ADMIN: "/admin",
} as const;

function getRequiredRole(pathname: string) {
  if (pathname.startsWith(ROLE_ROUTE_PREFIXES.CLIENT)) {
    return "CLIENT";
  }

  if (pathname.startsWith(ROLE_ROUTE_PREFIXES.THERAPIST)) {
    return "THERAPIST";
  }

  if (pathname.startsWith(ROLE_ROUTE_PREFIXES.ADMIN)) {
    return "ADMIN";
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requiredRole = getRequiredRole(pathname);

  if (!requiredRole) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

  if (!token) {
    const requestedPath = resolveSafeInternalCallbackUrl(
      `${pathname}${request.nextUrl.search}`,
      pathname,
    );
    const loginUrl = new URL(
      buildAuthRouteWithCallback(AUTH_ROUTES.login, requestedPath),
      request.url,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (token.role !== requiredRole) {
    return NextResponse.redirect(new URL("/403", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/client/:path*", "/therapist/:path*", "/admin/:path*"],
};
