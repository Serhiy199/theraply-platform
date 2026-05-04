import type { UserRole } from "@prisma/client";
import { AUTH_ROUTES, DASHBOARD_ROUTES } from "@/lib/constants/auth";

export const THERAPIST_ONBOARDING_ROUTE = "/therapist/onboarding";

type AuthRedirectUser = {
  role?: string;
  emailVerified?: boolean;
  therapistApprovalStatus?: string | null;
};

function isLocalAppPath(path?: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

export function canUseActiveTherapistFeatures(user: AuthRedirectUser | null | undefined) {
  if (!user || user.role !== "THERAPIST") {
    return false;
  }

  return user.emailVerified === true && user.therapistApprovalStatus === "APPROVED";
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

  if (isLocalAppPath(requestedPath) && requestedPath !== "/") {
    return requestedPath;
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
