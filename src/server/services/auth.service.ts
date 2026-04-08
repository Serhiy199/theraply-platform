import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { LoginInput, RegisterInput } from "@/lib/validations/auth";
import { AUTH_MESSAGES } from "@/lib/constants/auth";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "EMAIL_TAKEN" | "INVALID_CREDENTIALS" | "CREATE_FAILED",
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
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
