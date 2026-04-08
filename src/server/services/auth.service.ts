import { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import type { RegisterInput } from "@/lib/validations/auth";
import { AUTH_MESSAGES } from "@/lib/constants/auth";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "EMAIL_TAKEN" | "CREATE_FAILED",
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
