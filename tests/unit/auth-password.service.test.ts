import { EmailStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changePasswordForUser,
  requestPasswordReset,
  resetPasswordWithToken,
  validatePasswordResetToken,
} from "@/server/services/auth.service";

const userFindUniqueMock = vi.hoisted(() => vi.fn());
const userUpdateMock = vi.hoisted(() => vi.fn());
const passwordResetFindUniqueMock = vi.hoisted(() => vi.fn());
const passwordResetUpdateManyMock = vi.hoisted(() => vi.fn());
const passwordResetCreateMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const sendTransactionalEmailMock = vi.hoisted(() => vi.fn());
const createAuditMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn());
const verifyPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUniqueMock,
      update: userUpdateMock,
    },
    passwordResetToken: {
      findUnique: passwordResetFindUniqueMock,
      updateMany: passwordResetUpdateManyMock,
      create: passwordResetCreateMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/server/services/email-delivery.service", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: createAuditMock,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
}));

function mockTransaction() {
  transactionMock.mockImplementation(async (callback) =>
    callback({
      user: {
        update: userUpdateMock,
      },
      passwordResetToken: {
        updateMany: passwordResetUpdateManyMock,
        create: passwordResetCreateMock,
      },
    }),
  );
}

describe("auth password recovery and change service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction();
    hashPasswordMock.mockResolvedValue("hashed-new-password");
    sendTransactionalEmailMock.mockResolvedValue({
      emailLogId: "email-log-id",
      status: EmailStatus.SENT,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not disclose missing users during forgot password", async () => {
    userFindUniqueMock.mockResolvedValue(null);

    await expect(requestPasswordReset({ email: "missing@example.com" })).resolves.toBeUndefined();

    expect(passwordResetCreateMock).not.toHaveBeenCalled();
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it("stores only a token hash and sends reset email for active users", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-id",
      email: "client@example.com",
      firstName: "Client",
      isActive: true,
    });

    await requestPasswordReset({ email: "client@example.com" });

    expect(passwordResetCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = passwordResetCreateMock.mock.calls[0][0];
    expect(createArgs.data.tokenHash).toHaveLength(64);
    expect(createArgs.data.token).toBeUndefined();
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-id",
        email: "client@example.com",
        template: "PASSWORD_RESET",
        actionUrl: expect.stringContaining("/reset-password/"),
      }),
    );
  });

  it("normalizes password reset email links when APP_URL has a trailing slash", async () => {
    vi.stubEnv("APP_URL", "https://theraply-platform.vercel.app/");
    userFindUniqueMock.mockResolvedValue({
      id: "user-id",
      email: "client@example.com",
      firstName: "Client",
      isActive: true,
    });

    await requestPasswordReset({ email: "client@example.com" });

    const emailArgs = sendTransactionalEmailMock.mock.calls[0][0];
    expect(emailArgs.actionUrl).toMatch(
      /^https:\/\/theraply-platform\.vercel\.app\/reset-password\/[a-f0-9]{64}$/,
    );
    expect(emailArgs.actionUrl).not.toContain("app//reset-password");
  });

  it("rejects expired reset tokens", async () => {
    passwordResetFindUniqueMock.mockResolvedValue({
      id: "token-id",
      usedAt: null,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      user: {
        id: "user-id",
        email: "client@example.com",
        firstName: "Client",
        isActive: true,
        passwordHash: "old-hash",
      },
    });

    await expect(validatePasswordResetToken("raw-token")).resolves.toBe(false);
    await expect(
      resetPasswordWithToken({
        token: "raw-token",
        password: "NewPassword1!",
        confirmPassword: "NewPassword1!",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_RESET_INVALID_TOKEN",
    });
  });

  it("updates password and marks reset tokens used on successful reset", async () => {
    passwordResetFindUniqueMock.mockResolvedValue({
      id: "token-id",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-id",
        email: "client@example.com",
        firstName: "Client",
        isActive: true,
        passwordHash: "old-hash",
      },
    });

    await resetPasswordWithToken({
      token: "raw-token",
      password: "NewPassword1!",
      confirmPassword: "NewPassword1!",
    });

    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "user-id" },
      data: { passwordHash: "hashed-new-password" },
    });
    expect(passwordResetUpdateManyMock).toHaveBeenCalledWith({
      where: {
        userId: "user-id",
        usedAt: null,
      },
      data: {
        usedAt: expect.any(Date),
      },
    });
  });

  it("rejects change password when current password is wrong", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-id",
      isActive: true,
      passwordHash: "old-hash",
    });
    verifyPasswordMock.mockResolvedValue(false);

    await expect(
      changePasswordForUser("user-id", {
        currentPassword: "WrongPassword1!",
        password: "NewPassword1!",
        confirmPassword: "NewPassword1!",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_INVALID_CURRENT",
    });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects change password when the new password matches the old one", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-id",
      isActive: true,
      passwordHash: "old-hash",
    });
    verifyPasswordMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await expect(
      changePasswordForUser("user-id", {
        currentPassword: "OldPassword1!",
        password: "OldPassword1!",
        confirmPassword: "OldPassword1!",
      }),
    ).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_SAME_AS_CURRENT",
    });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("updates password on successful change password", async () => {
    userFindUniqueMock.mockResolvedValue({
      id: "user-id",
      isActive: true,
      passwordHash: "old-hash",
    });
    verifyPasswordMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await changePasswordForUser("user-id", {
      currentPassword: "OldPassword1!",
      password: "NewPassword1!",
      confirmPassword: "NewPassword1!",
    });

    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: "user-id" },
      data: { passwordHash: "hashed-new-password" },
    });
    expect(createAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-id",
        action: "PASSWORD_CHANGED",
      }),
    );
  });
});
