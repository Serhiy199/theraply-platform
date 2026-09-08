import { createHash, randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  AUTH_MESSAGES,
  AUTH_ROUTES,
  EMAIL_TEMPLATES,
  PASSWORD_RESET_RULES,
} from "@/lib/constants/auth";
import { buildPasswordResetEmail } from "@/lib/email/templates/transactional";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
import { sendTransactionalEmail } from "@/server/services/email-delivery.service";
import { sendEmailVerification } from "@/server/services/email-verification.service";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/lib/validations/auth";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMAIL_TAKEN"
      | "INVALID_CREDENTIALS"
      | "CREATE_FAILED"
      | "PASSWORD_RESET_REQUEST_FAILED"
      | "PASSWORD_RESET_INVALID_TOKEN"
      | "PASSWORD_RESET_FAILED"
      | "PASSWORD_CHANGE_INVALID_CURRENT"
      | "PASSWORD_CHANGE_SAME_AS_CURRENT"
      | "PASSWORD_CHANGE_FAILED",
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

function getPasswordResetExpiryDate() {
  return new Date(Date.now() + PASSWORD_RESET_RULES.tokenTtlHours * 60 * 60 * 1000);
}

function getPasswordResetBaseUrl() {
  const baseUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return baseUrl.replace(/\/+$/, "");
}

function buildAppUrl(path: string) {
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;
  return `${getPasswordResetBaseUrl()}${normalizedPath}`;
}

function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function findPasswordResetToken(token: string) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          firstName: true,
          passwordHash: true,
        },
      },
    },
  });
}

type PasswordResetTokenRecord = NonNullable<Awaited<ReturnType<typeof findPasswordResetToken>>>;

function isResetTokenUsable(tokenRecord: PasswordResetTokenRecord | null) {
  if (!tokenRecord) {
    return false;
  }

  return (
    tokenRecord.usedAt === null &&
    tokenRecord.expiresAt > new Date() &&
    tokenRecord.user.isActive
  );
}

export async function registerAccount(
  input: RegisterInput,
  options: { callbackUrl?: string | null } = {},
) {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          isActive: true,
          passwordHash,
        },
      });

      if (input.role === UserRole.CLIENT) {
        await tx.clientProfile.create({
          data: {
            userId: createdUser.id,
          },
        });
      }

      if (input.role === UserRole.THERAPIST) {
        await tx.therapistProfile.create({
          data: {
            userId: createdUser.id,
          },
        });
      }

      return createdUser;
    });

    await sendEmailVerification(user.id, options.callbackUrl);

    return user;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AuthServiceError(AUTH_MESSAGES.registerEmailTaken, "EMAIL_TAKEN");
    }

    throw new AuthServiceError(AUTH_MESSAGES.registerGenericError, "CREATE_FAILED");
  }
}

export async function authenticateWithCredentials(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      therapistProfile: {
        select: {
          approvalStatus: true,
          onboardingCompleted: true,
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt,
    therapistApprovalStatus: user.therapistProfile?.approvalStatus ?? null,
    therapistOnboardingCompleted: user.therapistProfile?.onboardingCompleted ?? null,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
  };
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      firstName: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = getPasswordResetExpiryDate();
  const now = new Date();
  const resetLink = buildAppUrl(`${AUTH_ROUTES.resetPasswordBase}/${token}`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });
  } catch {
    throw new AuthServiceError(
      AUTH_MESSAGES.forgotPasswordGenericError,
      "PASSWORD_RESET_REQUEST_FAILED",
    );
  }

  const email = buildPasswordResetEmail({
    recipientName: user.firstName,
    resetUrl: resetLink,
    expiresAt,
  });
  const delivery = await sendTransactionalEmail({
    userId: user.id,
    email: user.email,
    template: EMAIL_TEMPLATES.passwordReset,
    subject: email.subject,
    text: email.text,
    html: email.html,
    actionUrl: email.actionUrl,
  });

  await createAuditLogEntryBestEffort({
    actorUserId: user.id,
    entityType: "USER",
    entityId: user.id,
    action: "PASSWORD_RESET_REQUESTED",
    after: {
      emailLogId: delivery.emailLogId,
      emailStatus: delivery.status,
      expiresAt: expiresAt.toISOString(),
    },
  });
}

export async function validatePasswordResetToken(token: string) {
  const tokenRecord = await findPasswordResetToken(token);
  return isResetTokenUsable(tokenRecord);
}

export async function resetPasswordWithToken(input: ResetPasswordInput) {
  const tokenRecord = await findPasswordResetToken(input.token);

  if (!isResetTokenUsable(tokenRecord)) {
    throw new AuthServiceError(
      AUTH_MESSAGES.resetPasswordInvalidToken,
      "PASSWORD_RESET_INVALID_TOKEN",
    );
  }

  const activeTokenRecord = tokenRecord as PasswordResetTokenRecord;
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: activeTokenRecord.user.id,
        },
        data: {
          passwordHash,
        },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: activeTokenRecord.user.id,
          usedAt: null,
        },
        data: {
          usedAt: now,
        },
      });
    });
  } catch {
    throw new AuthServiceError(
      AUTH_MESSAGES.resetPasswordGenericError,
      "PASSWORD_RESET_FAILED",
    );
  }

  await createAuditLogEntryBestEffort({
    actorUserId: activeTokenRecord.user.id,
    entityType: "USER",
    entityId: activeTokenRecord.user.id,
    action: "PASSWORD_RESET_COMPLETED",
    after: {
      resetAt: now.toISOString(),
    },
  });
}

export async function changePasswordForUser(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (!user || !user.isActive) {
    throw new AuthServiceError(
      AUTH_MESSAGES.changePasswordInvalidCurrent,
      "PASSWORD_CHANGE_INVALID_CURRENT",
    );
  }

  const currentPasswordMatches = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordMatches) {
    throw new AuthServiceError(
      AUTH_MESSAGES.changePasswordInvalidCurrent,
      "PASSWORD_CHANGE_INVALID_CURRENT",
    );
  }

  const samePassword = await verifyPassword(input.password, user.passwordHash);

  if (samePassword) {
    throw new AuthServiceError(
      AUTH_MESSAGES.changePasswordSameAsCurrent,
      "PASSWORD_CHANGE_SAME_AS_CURRENT",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash,
      },
    });
  } catch {
    throw new AuthServiceError(
      AUTH_MESSAGES.changePasswordGenericError,
      "PASSWORD_CHANGE_FAILED",
    );
  }

  await createAuditLogEntryBestEffort({
    actorUserId: user.id,
    entityType: "USER",
    entityId: user.id,
    action: "PASSWORD_CHANGED",
    after: {
      changedAt: now.toISOString(),
    },
  });
}
