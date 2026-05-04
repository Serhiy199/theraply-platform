import { EmailStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TransactionalEmailInput = {
  userId?: string | null;
  email: string;
  template: string;
  subject: string;
  text: string;
  actionUrl?: string | null;
};

export type TransactionalEmailResult = {
  emailLogId: string;
  status: EmailStatus;
};

function canUseConsoleDelivery() {
  return process.env.NODE_ENV !== "production";
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
    console.info(formatConsoleEmail(input));

    const sentLog = await prisma.emailLog.update({
      where: {
        id: pendingLog.id,
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

    return {
      emailLogId: sentLog.id,
      status: sentLog.status,
    };
  }

  const failedLog = await prisma.emailLog.update({
    where: {
      id: pendingLog.id,
    },
    data: {
      status: EmailStatus.FAILED,
      failedAt: new Date(),
      errorMessage: "No transactional email provider is configured.",
    },
    select: {
      id: true,
      status: true,
    },
  });

  return {
    emailLogId: failedLog.id,
    status: failedLog.status,
  };
}
