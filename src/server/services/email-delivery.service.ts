import { EmailStatus } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export type TransactionalEmailInput = {
  userId?: string | null;
  email: string;
  template: string;
  subject: string;
  text: string;
  html?: string | null;
  actionUrl?: string | null;
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
  const pendingLog = await prisma.emailLog.create({
    data: {
      userId: input.userId ?? null,
      email: input.email,
      template: input.template,
      subject: input.subject,
      status: EmailStatus.PENDING,
    },
    select: {
      id: true,
    },
  });

  if (canUseConsoleDelivery()) {
    console.info("[email] console-delivery-enabled", {
      template: input.template,
      email: input.email,
      userId: input.userId ?? null,
      emailLogId: pendingLog.id,
    });
    console.info(formatConsoleEmail(input));

    const sentLog = await markEmailSent(pendingLog.id);

    return {
      emailLogId: sentLog.id,
      status: sentLog.status,
    };
  }

  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    const failedLog = await markEmailFailed(
      pendingLog.id,
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

    const sentLog = await markEmailSent(pendingLog.id);

    return {
      emailLogId: sentLog.id,
      status: sentLog.status,
    };
  } catch (error) {
    const failedLog = await markEmailFailed(pendingLog.id, formatEmailError(error));

    return {
      emailLogId: failedLog.id,
      status: failedLog.status,
    };
  }
}
