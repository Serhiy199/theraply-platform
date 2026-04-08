import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import { getCurrentUser } from "@/lib/auth/session";

export function hasRole(userRole: string | undefined, allowedRoles: UserRole[]) {
  if (!userRole) {
    return false;
  }

  return allowedRoles.includes(userRole as UserRole);
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(AUTH_ROUTES.login);
  }

  if (!hasRole(user.role, allowedRoles)) {
    redirect("/403");
  }

  return user;
}
