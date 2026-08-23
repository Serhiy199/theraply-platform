import { EmailStatus } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export type TransactionalEmailInput = {
  idempotencyKey?: string | null;
  userId?: string | null;
  email: string;
  template: string;
  subject: string;
  text: string;
  html?: string | null;
  actionUrl?: string | null;
};

type EmailDeliveryReservation = TransactionalEmailResult & {
  shouldSend: boolean;
};

export type TransactionalEmailResult = {
  emailLogId: string;
  status: EmailStatus;
};

const EMAIL_FROM_NAME = "Theraply";

function canUseConsoleDelivery() {
  return process.env.NODE_ENV !== "production";
}

function getSmtpPort() {
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);

  return Number.isFinite(port) ? port : 587;
}

function normalizeEnvValue(value: string | undefined, options?: { removeWhitespace?: boolean }) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return options?.removeWhitespace ? unquoted.replace(/\s/g, "") : unquoted;
}

function getSmtpConfig() {
  const host = normalizeEnvValue(process.env.SMTP_HOST);
  const user = normalizeEnvValue(process.env.SMTP_USER);
  const pass = normalizeEnvValue(process.env.SMTP_PASS, { removeWhitespace: true });
  const from = normalizeEnvValue(process.env.EMAIL_FROM);
  const replyTo = normalizeEnvValue(process.env.EMAIL_REPLY_TO);

  if (!host || !user || !pass || !from || !replyTo) {
    return null;
  }

  if (from.toLowerCase() !== user.toLowerCase()) {
    return null;
  }

  const port = getSmtpPort();

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    from: {
      name: EMAIL_FROM_NAME,
      address: user,
    },
    replyTo,
  };
}

function formatConsoleEmail(input: TransactionalEmailInput) {
  const lines = [
    `[email] ${input.template} -> ${input.email}`,
    `Subject: ${input.subject}`,
    input.text,
  ];

  if (input.actionUrl) {
    lines.push(`Action URL: ${input.actionUrl}`);
  }

  return lines.join("\n");
}

function formatEmailError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown email delivery error.";
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function reserveEmailDelivery(
  input: TransactionalEmailInput,
): Promise<EmailDeliveryReservation> {
  const idempotencyKey = input.idempotencyKey?.trim() || null;

  try {
    const pendingLog = await prisma.emailLog.create({
      data: {
        ...(idempotencyKey ? { id: idempotencyKey } : {}),
        userId: input.userId ?? null,
        email: input.email,
        template: input.template,
        subject: input.subject,
        status: EmailStatus.PENDING,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      emailLogId: pendingLog.id,
      status: pendingLog.status,
      shouldSend: true,
    };
  } catch (error) {
    if (!idempotencyKey || !isUniqueConstraintError(error)) {
      throw error;
    }

    const existingLog = await prisma.emailLog.findUnique({
      where: {
        id: idempotencyKey,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existingLog) {
      throw error;
    }

    if (existingLog.status !== EmailStatus.FAILED) {
      return {
        emailLogId: existingLog.id,
        status: existingLog.status,
        shouldSend: false,
      };
    }

    const retryClaim = await prisma.emailLog.updateMany({
      where: {
        id: idempotencyKey,
        status: EmailStatus.FAILED,
      },
      data: {
        status: EmailStatus.PENDING,
        sentAt: null,
        failedAt: null,
        errorMessage: null,
      },
    });

    if (retryClaim.count === 1) {
      return {
        emailLogId: idempotencyKey,
        status: EmailStatus.PENDING,
        shouldSend: true,
      };
    }

    const claimedLog = await prisma.emailLog.findUniqueOrThrow({
      where: {
        id: idempotencyKey,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      emailLogId: claimedLog.id,
      status: claimedLog.status,
      shouldSend: false,
    };
  }
}

async function markEmailSent(emailLogId: string) {
  return prisma.emailLog.update({
    where: {
      id: emailLogId,
    },
    data: {
      status: EmailStatus.SENT,
      sentAt: new Date(),
      failedAt: null,
      errorMessage: null,
    },
    select: {
      id: true,
      status: true,
    },
  });
}

async function markEmailFailed(emailLogId: string, errorMessage: string) {
  return prisma.emailLog.update({
    where: {
      id: emailLogId,
    },
    data: {
      status: EmailStatus.FAILED,
      failedAt: new Date(),
      errorMessage,
    },
    select: {
      id: true,
      status: true,
    },
  });
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailResult> {
  const reservation = await reserveEmailDelivery(input);

  if (!reservation.shouldSend) {
    return {
      emailLogId: reservation.emailLogId,
      status: reservation.status,
    };
  }

  const emailLogId = reservation.emailLogId;

  if (canUseConsoleDelivery()) {
    console.info("[email] console-delivery-enabled", {
      template: input.template,
      email: input.email,
      userId: input.userId ?? null,
      emailLogId,
    });
    console.info(formatConsoleEmail(input));

    const sentLog = await markEmailSent(emailLogId);

    return {
      emailLogId: sentLog.id,
      status: sentLog.status,
    };
  }

  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    const failedLog = await markEmailFailed(
      emailLogId,
      "SMTP email provider is not fully configured.",
    );

    return {
      emailLogId: failedLog.id,
      status: failedLog.status,
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  try {
    await transporter.sendMail({
      from: smtpConfig.from,
      replyTo: smtpConfig.replyTo,
      to: input.email,
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined,
    });

    const sentLog = await markEmailSent(emailLogId);

    return {
      emailLogId: sentLog.id,
      status: sentLog.status,
    };
  } catch (error) {
    const failedLog = await markEmailFailed(emailLogId, formatEmailError(error));

    return {
      emailLogId: failedLog.id,
      status: failedLog.status,
    };
  }
}
