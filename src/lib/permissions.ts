import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

export class ActionPermissionError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ActionPermissionError";
  }
}

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

export function assertActionRole(
  user: CurrentUser | null,
  allowedRoles: UserRole[],
  message?: string,
): asserts user is CurrentUser {
  if (!user || !hasRole(user.role, allowedRoles)) {
    throw new ActionPermissionError(message);
  }
}
