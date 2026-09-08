import { randomBytes } from "node:crypto";
import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import {
  AUTH_MESSAGES,
  AUTH_ROUTES,
  EMAIL_TEMPLATES,
  EMAIL_VERIFICATION_RULES,
} from "@/lib/constants/auth";
import { prisma } from "@/lib/prisma";
import { resolveClientBookingCallbackUrl } from "@/lib/auth/redirects";
import { createAuditLogEntryBestEffort } from "@/server/services/audit-log.service";
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
  status: "success" | "already_verified";
  userId: string;
  email: string;
  role: UserRole;
  verifiedAt: Date | null;
  therapistApprovalStatus?: TherapistApprovalStatus | null;
};

export type ResendEmailVerificationInput =
  | {
      userId: string;
      email?: never;
    }
  | {
      email: string;
      userId?: never;
    };

export type ResendEmailVerificationResult = {
  delivery?: EmailVerificationDeliveryResult;
  emailSent: boolean;
  alreadyVerified: boolean;
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
  return (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    .replace(/\/+$/, "");
}

function buildEmailVerificationUrl(token: string, callbackUrl?: string | null) {
  const verificationUrl = new URL(
    `${AUTH_ROUTES.verifyEmailBase}/${token}`,
    `${getEmailVerificationBaseUrl()}/`,
  );
  const safeCallbackUrl = resolveClientBookingCallbackUrl(callbackUrl);

  if (safeCallbackUrl) {
    verificationUrl.searchParams.set("callbackUrl", safeCallbackUrl);
  }

  return verificationUrl.toString();
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

function canUseEmailVerificationDevLogging() {
  return process.env.NODE_ENV !== "production";
}

function logEmailVerificationDevEvent(
  event: string,
  metadata: Record<string, string | number | boolean | null | undefined>,
) {
  if (!canUseEmailVerificationDevLogging()) {
    return;
  }

  console.info(`[email-verification] ${event}`, metadata);
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
          emailVerified: true,
          emailVerifiedAt: true,
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
  callbackUrl?: string | null,
): Promise<EmailVerificationCreationResult> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = getEmailVerificationExpiryDate();
  const now = new Date();
  let invalidatedTokenCount = 0;
  let createdTokenId = "";

  await prisma.$transaction(async (tx) => {
    const invalidatedTokens = await tx.emailVerificationToken.updateMany({
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
    invalidatedTokenCount = invalidatedTokens.count;

    const createdToken = await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
      select: {
        id: true,
      },
    });
    createdTokenId = createdToken.id;
  });

  const verificationUrl = buildEmailVerificationUrl(token, callbackUrl);

  logEmailVerificationDevEvent("token-created", {
    userId: user.id,
    email: user.email,
    tokenId: createdTokenId,
    expiresAt: expiresAt.toISOString(),
    invalidatedTokenCount,
    verificationUrl,
  });

  return {
    token,
    expiresAt,
    verificationUrl,
  };
}

export async function sendEmailVerification(
  userId: string,
  callbackUrl?: string | null,
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

  const verification = await createEmailVerificationForUser(user, callbackUrl);
  const delivery = await sendTransactionalEmail({
    userId: user.id,
    email: user.email,
    template: EMAIL_TEMPLATES.verification,
    subject: "Verify your Theraply email",
    text: buildVerificationEmailText(user, verification.verificationUrl),
    actionUrl: verification.verificationUrl,
  });

  logEmailVerificationDevEvent("email-sent", {
    userId: user.id,
    email: user.email,
    emailLogId: delivery.emailLogId,
    status: delivery.status,
    verificationUrl: verification.verificationUrl,
  });

  return {
    ...verification,
    emailLogId: delivery.emailLogId,
  };
}

export async function resendEmailVerification(
  input: ResendEmailVerificationInput,
): Promise<ResendEmailVerificationResult> {
  const user = await prisma.user.findFirst({
    where: input.userId
      ? {
          id: input.userId,
        }
      : {
          email: input.email,
        },
    select: {
      id: true,
      isActive: true,
      emailVerified: true,
    },
  });

  if (!user || !user.isActive) {
    logEmailVerificationDevEvent("resend-skipped", {
      reason: !user ? "user_not_found" : "user_inactive",
      userId: input.userId ?? null,
      email: input.email ?? null,
    });

    return {
      emailSent: false,
      alreadyVerified: false,
    };
  }

  if (user.emailVerified) {
    logEmailVerificationDevEvent("resend-skipped", {
      reason: "already_verified",
      userId: user.id,
      email: input.email ?? null,
    });

    return {
      emailSent: false,
      alreadyVerified: true,
    };
  }

  const delivery = await sendEmailVerification(user.id);

  logEmailVerificationDevEvent("resend-sent", {
    userId: user.id,
    emailLogId: delivery.emailLogId,
    verificationUrl: delivery.verificationUrl,
  });

  return {
    delivery,
    emailSent: true,
    alreadyVerified: false,
  };
}

export async function verifyEmailToken(token: string): Promise<EmailVerificationResult> {
  const tokenRecord = await findEmailVerificationToken(token);

  if (!tokenRecord) {
    logEmailVerificationDevEvent("verify-failed", {
      reason: "token_not_found",
    });

    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationInvalidToken,
      "TOKEN_NOT_FOUND",
    );
  }

  if (tokenRecord.usedAt) {
    if (tokenRecord.user.emailVerified) {
      logEmailVerificationDevEvent("verify-already-succeeded", {
        tokenId: tokenRecord.id,
        userId: tokenRecord.user.id,
        usedAt: tokenRecord.usedAt.toISOString(),
      });

      return {
        status: "already_verified",
        userId: tokenRecord.user.id,
        email: tokenRecord.user.email,
        role: tokenRecord.user.role,
        verifiedAt: tokenRecord.user.emailVerifiedAt,
        therapistApprovalStatus: tokenRecord.user.therapistProfile?.approvalStatus ?? null,
      };
    }

    logEmailVerificationDevEvent("verify-failed", {
      reason: "token_used",
      tokenId: tokenRecord.id,
      userId: tokenRecord.user.id,
    });

    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationUsedToken,
      "TOKEN_USED",
    );
  }

  if (tokenRecord.expiresAt <= new Date()) {
    if (tokenRecord.user.emailVerified) {
      logEmailVerificationDevEvent("verify-already-succeeded", {
        tokenId: tokenRecord.id,
        userId: tokenRecord.user.id,
        expiresAt: tokenRecord.expiresAt.toISOString(),
      });

      return {
        status: "already_verified",
        userId: tokenRecord.user.id,
        email: tokenRecord.user.email,
        role: tokenRecord.user.role,
        verifiedAt: tokenRecord.user.emailVerifiedAt,
        therapistApprovalStatus: tokenRecord.user.therapistProfile?.approvalStatus ?? null,
      };
    }

    logEmailVerificationDevEvent("verify-failed", {
      reason: "token_expired",
      tokenId: tokenRecord.id,
      userId: tokenRecord.user.id,
      expiresAt: tokenRecord.expiresAt.toISOString(),
    });

    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationExpiredToken,
      "TOKEN_EXPIRED",
    );
  }

  if (!tokenRecord.user.isActive) {
    logEmailVerificationDevEvent("verify-failed", {
      reason: "user_inactive",
      tokenId: tokenRecord.id,
      userId: tokenRecord.user.id,
    });

    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationInvalidToken,
      "USER_INACTIVE",
    );
  }

  if (tokenRecord.user.emailVerified) {
    await prisma.emailVerificationToken.update({
      where: {
        id: tokenRecord.id,
      },
      data: {
        usedAt: new Date(),
      },
    });

    logEmailVerificationDevEvent("verify-already-succeeded", {
      tokenId: tokenRecord.id,
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email,
    });

    return {
      status: "already_verified",
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
      verifiedAt: tokenRecord.user.emailVerifiedAt,
      therapistApprovalStatus: tokenRecord.user.therapistProfile?.approvalStatus ?? null,
    };
  }

  const now = new Date();
  const therapistStatusBefore = tokenRecord.user.therapistProfile?.approvalStatus ?? null;
  const willMoveTherapistToProfileIncomplete =
    tokenRecord.user.role === UserRole.THERAPIST &&
    therapistStatusBefore === TherapistApprovalStatus.EMAIL_NOT_VERIFIED;

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
    logEmailVerificationDevEvent("verify-failed", {
      reason: "transaction_failed",
      tokenId: tokenRecord.id,
      userId: tokenRecord.user.id,
    });

    throw new EmailVerificationServiceError(
      AUTH_MESSAGES.emailVerificationGenericError,
      "VERIFY_FAILED",
    );
  }

  logEmailVerificationDevEvent("verify-succeeded", {
    tokenId: tokenRecord.id,
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    role: tokenRecord.user.role,
    verifiedAt: now.toISOString(),
    therapistStatusBefore,
    therapistStatusAfter: willMoveTherapistToProfileIncomplete
      ? TherapistApprovalStatus.PROFILE_INCOMPLETE
      : therapistStatusBefore,
  });

  await createAuditLogEntryBestEffort({
    actorUserId: tokenRecord.user.id,
    entityType: "User",
    entityId: tokenRecord.user.id,
    action: "EMAIL_VERIFIED",
    before: {
      emailVerified: tokenRecord.user.emailVerified,
      emailVerifiedAt: tokenRecord.user.emailVerifiedAt,
      therapistApprovalStatus: therapistStatusBefore,
    },
    after: {
      emailVerified: true,
      emailVerifiedAt: now,
      therapistApprovalStatus: willMoveTherapistToProfileIncomplete
        ? TherapistApprovalStatus.PROFILE_INCOMPLETE
        : therapistStatusBefore,
    },
  });

  return {
    status: "success",
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    role: tokenRecord.user.role,
    verifiedAt: now,
    therapistApprovalStatus: willMoveTherapistToProfileIncomplete
      ? TherapistApprovalStatus.PROFILE_INCOMPLETE
      : therapistStatusBefore,
  };
}
