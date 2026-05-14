import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { THERAPIST_ONBOARDING_ROUTE } from "@/lib/auth/redirects";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { AUTH_ROUTES } from "@/lib/constants/auth";
import { prisma } from "@/lib/prisma";
import { canUseActiveTherapistFeatures } from "@/lib/therapist-lifecycle";

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

const actionUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  emailVerified: true,
  emailVerifiedAt: true,
  therapistProfile: {
    select: {
      approvalStatus: true,
      onboardingCompleted: true,
    },
  },
} as const;

function toCurrentUser(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  therapistProfile: {
    approvalStatus: string;
    onboardingCompleted: boolean;
  } | null;
}): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    role: user.role,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    therapistApprovalStatus: user.therapistProfile?.approvalStatus ?? null,
    therapistOnboardingCompleted: user.therapistProfile?.onboardingCompleted ?? null,
  };
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(AUTH_ROUTES.login);
  }

  const freshUser = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: true,
      therapistProfile: {
        select: {
          approvalStatus: true,
          onboardingCompleted: true,
        },
      },
    },
  });

  if (!freshUser || !freshUser.isActive) {
    redirect(AUTH_ROUTES.login);
  }

  if (!hasRole(freshUser.role, allowedRoles)) {
    redirect("/403");
  }

  return {
    id: freshUser.id,
    email: freshUser.email,
    firstName: freshUser.firstName ?? undefined,
    lastName: freshUser.lastName ?? undefined,
    role: freshUser.role,
    emailVerified: freshUser.emailVerified,
    emailVerifiedAt: freshUser.emailVerifiedAt?.toISOString() ?? null,
    therapistApprovalStatus: freshUser.therapistProfile?.approvalStatus ?? null,
    therapistOnboardingCompleted: freshUser.therapistProfile?.onboardingCompleted ?? null,
  };
}

async function hasActiveTherapistAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      emailVerified: true,
      therapistProfile: {
        select: {
          approvalStatus: true,
        },
      },
    },
  });

  return (
    canUseActiveTherapistFeatures(user)
  );
}

export async function requireActiveTherapistFeatures() {
  const user = await requireRole([UserRole.THERAPIST]);

  if (!(await hasActiveTherapistAccess(user.id))) {
    redirect(THERAPIST_ONBOARDING_ROUTE);
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

export async function requireCurrentActionRole(
  user: CurrentUser | null,
  allowedRoles: UserRole[],
  message = "You do not have permission to perform this action.",
) {
  assertActionRole(user, allowedRoles, message);

  const freshUser = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: actionUserSelect,
  });

  if (!freshUser || !freshUser.isActive || !hasRole(freshUser.role, allowedRoles)) {
    throw new ActionPermissionError(message);
  }

  return toCurrentUser(freshUser);
}

export async function requireActionRole(
  allowedRoles: UserRole[],
  message = "You do not have permission to perform this action.",
) {
  const user = await getCurrentUser();
  return requireCurrentActionRole(user, allowedRoles, message);
}

export async function requireActionActiveTherapistFeatures(
  user: CurrentUser | null,
  message = "Your therapist profile must be verified and approved before using active therapist features.",
) {
  const freshUser = await requireCurrentActionRole(user, [UserRole.THERAPIST], message);

  if (!(await hasActiveTherapistAccess(freshUser.id))) {
    throw new ActionPermissionError(message);
  }

  return freshUser;
}
