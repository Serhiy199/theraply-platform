import { randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AUTH_MESSAGES, AUTH_ROUTES, PASSWORD_RESET_RULES } from "@/lib/constants/auth";
import type {
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
      | "PASSWORD_RESET_FAILED",
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

function getPasswordResetExpiryDate() {
  return new Date(Date.now() + PASSWORD_RESET_RULES.tokenTtlHours * 60 * 60 * 1000);
}

function getPasswordResetBaseUrl() {
  return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

async function findPasswordResetToken(token: string) {
  return prisma.passwordResetToken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
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

export async function registerClientAccount(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: UserRole.CLIENT,
          isActive: true,
          passwordHash,
        },
      });

      await tx.clientProfile.create({
        data: {
          userId: createdUser.id,
        },
      });

      return createdUser;
    });

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
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = getPasswordResetExpiryDate();
  const now = new Date();

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
          token,
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

  if (process.env.NODE_ENV !== "production") {
    const resetLink = `${getPasswordResetBaseUrl()}${AUTH_ROUTES.resetPasswordBase}/${token}`;
    console.info(`[auth] Password reset link for ${user.email}: ${resetLink}`);
  }
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
}
