import { EmailStatus, TherapistApprovalStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resendEmailVerification, sendEmailVerification, verifyEmailToken } from "@/server/services/email-verification.service";
import { registerAccount } from "@/server/services/auth.service";
import { canUseActiveTherapistFeatures } from "@/lib/therapist-lifecycle";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(), userFindFirst: vi.fn(), userCreate: vi.fn(), userUpdate: vi.fn(),
  profileCreate: vi.fn(), profileUpdate: vi.fn(), tokenFind: vi.fn(), tokenCreate: vi.fn(), tokenUpdate: vi.fn(),
  tokenUpdateMany: vi.fn(), transaction: vi.fn(), send: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
  emailVerificationToken: { findUnique: mocks.tokenFind, update: mocks.tokenUpdate },
  $transaction: mocks.transaction,
} }));
vi.mock("@/server/services/email-delivery.service", () => ({ sendTransactionalEmail: mocks.send }));
vi.mock("@/server/services/audit-log.service", () => ({ createAuditLogEntryBestEffort: mocks.audit }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn(async () => "local-mock-hash"), verifyPassword: vi.fn() }));

const now = new Date("2026-11-05T12:00:00Z");
const user = { id: "imported-therapist", email: "person@example.test", firstName: "Person", isActive: true, emailVerified: false };
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://platform.theraply.online");
  mocks.userFindUnique.mockResolvedValue(user);
  mocks.userFindFirst.mockResolvedValue(user);
  mocks.userCreate.mockResolvedValue(user);
  mocks.tokenCreate.mockResolvedValue({ id: "mock-token-id" });
  mocks.tokenUpdateMany.mockResolvedValue({ count: 2 });
  mocks.send.mockResolvedValue({ emailLogId: "mock-email-log", status: EmailStatus.SENT });
  mocks.transaction.mockImplementation(async callback => callback({
    user: { create: mocks.userCreate, update: mocks.userUpdate },
    therapistProfile: { create: mocks.profileCreate, update: mocks.profileUpdate },
    emailVerificationToken: { create: mocks.tokenCreate, updateMany: mocks.tokenUpdateMany, update: mocks.tokenUpdate },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("verification delivery outcome propagation", () => {
  it.each([EmailStatus.SENT, EmailStatus.FAILED, EmailStatus.PENDING])("preserves %s without throwing after token/account persistence", async status => {
    mocks.send.mockResolvedValue({ emailLogId: "mock-email-log", status });
    await expect(sendEmailVerification(user.id)).resolves.toMatchObject({ status, emailLogId: "mock-email-log" });
    expect(mocks.tokenCreate).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });
  it.each([EmailStatus.SENT, EmailStatus.FAILED, EmailStatus.PENDING])("marks emailSent true only for actual SENT (%s)", async status => {
    mocks.send.mockResolvedValue({ emailLogId: "mock-email-log", status });
    const result = await resendEmailVerification({ userId: user.id });
    expect(result).toMatchObject({ emailSent: status === EmailStatus.SENT, alreadyVerified: false, delivery: { status } });
    expect(mocks.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: user.id } }));
    expect(mocks.tokenCreate).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...user, isActive: false }])("skips missing/inactive users without creating a token or email", async value => {
    mocks.userFindFirst.mockResolvedValue(value);
    expect(await resendEmailVerification({ email: user.email })).toEqual({ emailSent: false, alreadyVerified: false });
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("skips already verified users", async () => {
    mocks.userFindFirst.mockResolvedValue({ ...user, emailVerified: true });
    expect(await resendEmailVerification({ userId: user.id })).toEqual({ emailSent: false, alreadyVerified: true });
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("existing verification token lifecycle and APPROVED access", () => {
  it("creates one 24-hour token, invalidates old active tokens and does not log it in production", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendEmailVerification(user.id);
    expect(result.expiresAt).toEqual(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.tokenCreate).toHaveBeenCalledExactlyOnceWith({ data: {
      userId: user.id, token: result.token, expiresAt: result.expiresAt,
    }, select: { id: true } });
    expect(mocks.tokenUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
    });
    expect(new URL(result.verificationUrl).origin).toBe("https://platform.theraply.online");
    expect(log).not.toHaveBeenCalled();
  });
  function verificationRecord(expiresAt = new Date(now.getTime() + 60_000), usedAt: Date | null = null) {
    return { id: "mock-token-id", expiresAt, usedAt, user: {
      ...user, role: "THERAPIST", emailVerifiedAt: null,
      therapistProfile: { id: "approved-profile", approvalStatus: TherapistApprovalStatus.APPROVED },
    } };
  }
  it("verifies an imported approved therapist without changing approval and unlocks dashboard eligibility", async () => {
    mocks.tokenFind.mockResolvedValue(verificationRecord());
    expect(canUseActiveTherapistFeatures({ emailVerified: false, therapistProfile: { approvalStatus: "APPROVED" } })).toBe(false);
    const result = await verifyEmailToken("synthetic-token");
    expect(result).toMatchObject({ status: "success", userId: user.id, therapistApprovalStatus: "APPROVED" });
    expect(mocks.userUpdate).toHaveBeenCalledExactlyOnceWith({ where: { id: user.id }, data: { emailVerified: true, emailVerifiedAt: now } });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(canUseActiveTherapistFeatures({ emailVerified: true, therapistProfile: { approvalStatus: result.therapistApprovalStatus } })).toBe(true);
  });
  it.each([
    ["expired", new Date(now.getTime() - 1), null, "TOKEN_EXPIRED"],
    ["used", new Date(now.getTime() + 60_000), now, "TOKEN_USED"],
  ] as const)("rejects %s tokens without verifying the user", async (_label, expiresAt, usedAt, code) => {
    mocks.tokenFind.mockResolvedValue(verificationRecord(expiresAt, usedAt));
    await expect(verifyEmailToken("synthetic-token")).rejects.toMatchObject({ code });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });
});

describe("existing registration compatibility", () => {
  it.each([EmailStatus.SENT, EmailStatus.FAILED, EmailStatus.PENDING])("does not report CREATE_FAILED after persisting an account when delivery is %s", async status => {
    mocks.send.mockResolvedValue({ emailLogId: "mock-email-log", status });
    await expect(registerAccount({ firstName: "Person", lastName: "Test", email: user.email,
      role: "THERAPIST", password: "LocalTest1!", confirmPassword: "LocalTest1!" })).resolves.toEqual(user);
    expect(mocks.userCreate).toHaveBeenCalledTimes(1);
    expect(mocks.profileCreate).toHaveBeenCalledTimes(1);
    expect(mocks.tokenCreate).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
