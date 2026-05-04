import { randomBytes } from "node:crypto";
import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import {
  AUTH_MESSAGES,
  AUTH_ROUTES,
  EMAIL_TEMPLATES,
  EMAIL_VERIFICATION_RULES,
} from "@/lib/constants/auth";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/server/services/email-delivery.service";

type EmailVerificationUser = {
  id: string;
  email: string;
  firstName?: string | null;
};

export type EmailVerificationCreationResult = {
  token: string;
  expiresAt: Date;
  verificationUrl: string;
};

export type EmailVerificationDeliveryResult = EmailVerificationCreationResult & {
  emailLogId: string;
};

export type EmailVerificationResult = {
  userId: string;
  email: string;
  role: UserRole;
  verifiedAt: Date;
};

export class EmailVerificationServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "USER_NOT_FOUND"
      | "TOKEN_NOT_FOUND"
      | "TOKEN_USED"
      | "TOKEN_EXPIRED"
      | "USER_INACTIVE"
      | "VERIFY_FAILED",
  ) {
    super(message);
    this.name = "EmailVerificationServiceError";
  }
}

function getEmailVerificationExpiryDate() {
  return new Date(
    Date.now() + EMAIL_VERIFICATION_RULES.tokenTtlHours * 60 * 60 * 1000,
  );
}

function getEmailVerificationBaseUrl() {
  return process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

function buildEmailVerificationUrl(token: string) {
  return `${getEmailVerificationBaseUrl()}${AUTH_ROUTES.verifyEmailBase}/${token}`;
}

function buildVerificationEmailText(user: EmailVerificationUser, verificationUrl: string) {
  const greeting = user.firstName?.trim() ? `Hi ${user.firstName.trim()},` : "Hi,";

  return [
    greeting,
    "",
    "Verify your Theraply email address to finish setting up your account.",
    "",
    verificationUrl,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");
}

async function findEmailVerificationToken(token: string) {
  return prisma.emailVerificationToken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          therapistProfile: {
            select: {
              id: true,
              approvalStatus: true,
            },
          },
        },
      },
    },
  });
}

export async function createEmailVerificationForUser(
  user: EmailVerificationUser,
): Promise<EmailVerificationCreationResult> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = getEmailVerificationExpiryDate();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
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

    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });
  });

  return {
    token,
    expiresAt,
    verificationUrl: buildEmailVerificationUrl(token),
  };
}

export async function sendEmailVerification(
  userId: string,
): Promise<EmailVerificationDeliveryResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationGenericError,
      "USER_NOT_FOUND",
    );
  }

  const verification = await createEmailVerificationForUser(user);
  const delivery = await sendTransactionalEmail({
    userId: user.id,
    email: user.email,
    template: EMAIL_TEMPLATES.verification,
    subject: "Verify your Theraply email",
    text: buildVerificationEmailText(user, verification.verificationUrl),
    actionUrl: verification.verificationUrl,
  });

  return {
    ...verification,
    emailLogId: delivery.emailLogId,
  };
}

export async function verifyEmailToken(token: string): Promise<EmailVerificationResult> {
  const tokenRecord = await findEmailVerificationToken(token);

  if (!tokenRecord) {
    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationInvalidToken,
      "TOKEN_NOT_FOUND",
    );
  }

  if (tokenRecord.usedAt) {
    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationUsedToken,
      "TOKEN_USED",
    );
  }

  if (tokenRecord.expiresAt <= new Date()) {
    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationExpiredToken,
      "TOKEN_EXPIRED",
    );
  }

  if (!tokenRecord.user.isActive) {
    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationInvalidToken,
      "USER_INACTIVE",
    );
  }

  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: {
          id: tokenRecord.id,
        },
        data: {
          usedAt: now,
        },
      });

      await tx.user.update({
        where: {
          id: tokenRecord.user.id,
        },
        data: {
          emailVerified: true,
          emailVerifiedAt: now,
        },
      });

      if (
        tokenRecord.user.role === UserRole.THERAPIST &&
        tokenRecord.user.therapistProfile?.approvalStatus ===
          TherapistApprovalStatus.EMAIL_NOT_VERIFIED
      ) {
        await tx.therapistProfile.update({
          where: {
            id: tokenRecord.user.therapistProfile.id,
          },
          data: {
            approvalStatus: TherapistApprovalStatus.PROFILE_INCOMPLETE,
          },
        });
      }
    });
  } catch {
    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationGenericError,
      "VERIFY_FAILED",
    );
  }

  return {
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    role: tokenRecord.user.role,
    verifiedAt: now,
  };
}
