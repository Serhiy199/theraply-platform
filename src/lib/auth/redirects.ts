import type { UserRole } from "@prisma/client";
import { DASHBOARD_ROUTES } from "@/lib/constants/auth";

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
