import type { UserRole } from "@prisma/client";
import { AUTH_ROUTES, DASHBOARD_ROUTES } from "@/lib/constants/auth";
import { canUseActiveTherapistFeatures as canUseTherapistFeatures } from "@/lib/therapist-lifecycle";

export const THERAPIST_ONBOARDING_ROUTE = "/therapist/onboarding";

type AuthRedirectUser = {
  role?: string;
  emailVerified?: boolean;
  therapistApprovalStatus?: string | null;
};

const INTERNAL_URL_BASE = "https://theraply.invalid";

function decodeCallbackCandidate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return null;
  }
}

function normalizeInternalPath(value: unknown) {
  const candidate = decodeCallbackCandidate(value);

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_URL_BASE);
    if (parsed.origin !== INTERNAL_URL_BASE) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function resolveSafeInternalCallbackUrl(
  value: unknown,
  fallback = "/",
) {
  return normalizeInternalPath(value) ?? normalizeInternalPath(fallback) ?? fallback;
}

export function resolveClientBookingCallbackUrl(value: unknown) {
  const safePath = resolveSafeInternalCallbackUrl(value, "");
  if (!safePath) {
    return null;
  }

  const { pathname } = new URL(safePath, INTERNAL_URL_BASE);
  return /^\/client\/book\/[^/]+$/.test(pathname) && pathname !== "/client/book/new"
    ? safePath
    : null;
}

export function buildAuthRouteWithCallback(
  authRoute: string,
  callbackUrl: unknown,
) {
  const safeCallbackUrl = resolveSafeInternalCallbackUrl(callbackUrl, "");
  if (!safeCallbackUrl) {
    return authRoute;
  }

  const searchParams = new URLSearchParams({ callbackUrl: safeCallbackUrl });
  return `${authRoute}?${searchParams.toString()}`;
}

function isRoleCompatiblePath(role: string | undefined, path: string) {
  switch (role as UserRole | undefined) {
    case "CLIENT":
      return path.startsWith("/client/") || path === "/client";
    case "THERAPIST":
      return path.startsWith("/therapist/") || path === "/therapist";
    case "ADMIN":
      return path.startsWith("/admin/") || path === "/admin";
    default:
      return false;
  }
}

export function canUseActiveTherapistFeatures(user: AuthRedirectUser | null | undefined) {
  if (!user || user.role !== "THERAPIST") {
    return false;
  }

  return canUseTherapistFeatures({
    emailVerified: user.emailVerified,
    therapistProfile: {
      approvalStatus: user.therapistApprovalStatus,
    },
  });
}

export function getDashboardRouteForRole(role?: string) {
  switch (role as UserRole | undefined) {
    case "CLIENT":
      return DASHBOARD_ROUTES.client;
    case "THERAPIST":
      return DASHBOARD_ROUTES.therapist;
    case "ADMIN":
      return DASHBOARD_ROUTES.admin;
    default:
      return DASHBOARD_ROUTES.client;
  }
}

export function getPostLoginRedirectForUser(
  user: AuthRedirectUser | null | undefined,
  requestedPath?: string | null,
) {
  if (user?.role === "THERAPIST" && !canUseActiveTherapistFeatures(user)) {
    return THERAPIST_ONBOARDING_ROUTE;
  }

  const safeRequestedPath = resolveSafeInternalCallbackUrl(requestedPath, "/");
  if (
    safeRequestedPath !== "/" &&
    isRoleCompatiblePath(user?.role, safeRequestedPath)
  ) {
    return safeRequestedPath;
  }

  return getDashboardRouteForRole(user?.role);
}

export function getEmailVerificationRedirectForRole(role?: string) {
  switch (role as UserRole | undefined) {
    case "CLIENT":
      return DASHBOARD_ROUTES.client;
    case "THERAPIST":
      return THERAPIST_ONBOARDING_ROUTE;
    case "ADMIN":
      return DASHBOARD_ROUTES.admin;
    default:
      return AUTH_ROUTES.login;
  }
}
