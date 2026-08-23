import { EmailStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTransactionalEmail } from "@/server/services/email-delivery.service";

const createEmailLogMock = vi.hoisted(() => vi.fn());
const findEmailLogMock = vi.hoisted(() => vi.fn());
const findEmailLogOrThrowMock = vi.hoisted(() => vi.fn());
const updateEmailLogMock = vi.hoisted(() => vi.fn());
const updateManyEmailLogMock = vi.hoisted(() => vi.fn());
const sendMailMock = vi.hoisted(() => vi.fn());
const createTransportMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailLog: {
      create: createEmailLogMock,
      findUnique: findEmailLogMock,
      findUniqueOrThrow: findEmailLogOrThrowMock,
      update: updateEmailLogMock,
      updateMany: updateManyEmailLogMock,
    },
  },
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

type StoredEmailLog = {
  id: string;
  status: EmailStatus;
  sentAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
};

const emailLogs = new Map<string, StoredEmailLog>();
let generatedId = 0;

function getStoredLog(id: string) {
  const log = emailLogs.get(id);

  return log ? { id: log.id, status: log.status } : null;
}

function buildInput(idempotencyKey: string) {
  return {
    idempotencyKey,
    userId: "client-id",
    email: "client@example.com",
    template: "payment-successful",
    subject: "Payment received",
    text: "Your payment was received.",
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "mail@example.com");
  vi.stubEnv("SMTP_PASS", "test-password");
  vi.stubEnv("EMAIL_FROM", "mail@example.com");
  vi.stubEnv("EMAIL_REPLY_TO", "reply@example.com");

  emailLogs.clear();
  generatedId = 0;
  sendMailMock.mockResolvedValue({ messageId: "message-id" });
  createTransportMock.mockReturnValue({ sendMail: sendMailMock });

  createEmailLogMock.mockImplementation(async ({ data }) => {
    const id = data.id ?? `generated-${++generatedId}`;

    if (emailLogs.has(id)) {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }

    const log: StoredEmailLog = {
      id,
      status: data.status,
      sentAt: null,
      failedAt: null,
      errorMessage: null,
    };
    emailLogs.set(id, log);
    return { id, status: log.status };
  });
  findEmailLogMock.mockImplementation(async ({ where }) => getStoredLog(where.id));
  findEmailLogOrThrowMock.mockImplementation(async ({ where }) => {
    const log = getStoredLog(where.id);

    if (!log) {
      throw new Error("EmailLog not found");
    }

    return log;
  });
  updateManyEmailLogMock.mockImplementation(async ({ where, data }) => {
    const log = emailLogs.get(where.id);

    if (!log || log.status !== where.status) {
      return { count: 0 };
    }

    Object.assign(log, data);
    return { count: 1 };
  });
  updateEmailLogMock.mockImplementation(async ({ where, data }) => {
    const log = emailLogs.get(where.id);

    if (!log) {
      throw new Error("EmailLog not found");
    }

    Object.assign(log, data);
    return { id: log.id, status: log.status };
  });
});

describe("transactional email idempotency", () => {
  it("delivers concurrent calls for one payment only once", async () => {
    const input = buildInput("payment-success:payment-1");

    await Promise.all([
      sendTransactionalEmail(input),
      sendTransactionalEmail(input),
      sendTransactionalEmail(input),
    ]);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(emailLogs).toHaveLength(1);
    expect(emailLogs.get(input.idempotencyKey)?.status).toBe(EmailStatus.SENT);
  });

  it("does not redeliver an already sent payment email", async () => {
    const input = buildInput("payment-success:payment-1");

    await sendTransactionalEmail(input);
    const duplicate = await sendTransactionalEmail(input);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(duplicate.status).toBe(EmailStatus.SENT);
  });

  it("retries a failed provider delivery and keeps one durable intent", async () => {
    const input = buildInput("payment-success:payment-1");
    sendMailMock.mockRejectedValueOnce(new Error("SMTP unavailable"));

    const failed = await sendTransactionalEmail(input);
    const retried = await sendTransactionalEmail(input);

    expect(failed.status).toBe(EmailStatus.FAILED);
    expect(retried.status).toBe(EmailStatus.SENT);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(emailLogs).toHaveLength(1);
    expect(emailLogs.get(input.idempotencyKey)?.status).toBe(EmailStatus.SENT);
  });

  it("does not suppress emails for different payments", async () => {
    await sendTransactionalEmail(buildInput("payment-success:payment-1"));
    await sendTransactionalEmail(buildInput("payment-success:payment-2"));

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(emailLogs).toHaveLength(2);
  });
});
