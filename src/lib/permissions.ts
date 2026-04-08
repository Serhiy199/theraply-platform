import type { UserRole } from "@prisma/client";
import { requireAuth } from "@/lib/auth/session";

export function hasRole(userRole: string | undefined, allowedRoles: UserRole[]) {
  if (!userRole) {
    return false;
  }

  return allowedRoles.includes(userRole as UserRole);
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireAuth();

  if (!hasRole(user.role, allowedRoles)) {
    throw new Error("FORBIDDEN");
  }

  return user;
}
