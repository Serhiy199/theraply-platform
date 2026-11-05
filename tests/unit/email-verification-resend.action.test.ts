import { EmailStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resendEmailVerificationAction } from "@/app/verify-email/actions";
import { initialResendEmailVerificationActionState as initial } from "@/app/verify-email/state";
import { AUTH_MESSAGES } from "@/lib/constants/auth";
import { RATE_LIMIT_PRESETS } from "@/lib/constants/rate-limit";

const mocks = vi.hoisted(() => ({ user: vi.fn(), resend: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/server/services/email-verification.service", () => ({
  resendEmailVerification: mocks.resend,
  EmailVerificationServiceError: class EmailVerificationServiceError extends Error {},
}));
vi.mock("@/server/services/rate-limit.service", () => ({
  checkRateLimitPreset: mocks.limit,
  buildUserRateLimitIdentifier: ({ userId, email }: { userId?: string; email?: string }) => userId ? `user:${userId}` : `email:${email}`,
}));

function outcome(status: EmailStatus) {
  return { emailSent: status === EmailStatus.SENT, alreadyVerified: false, delivery: {
    status, emailLogId: "mock-email-log", token: "private-test-token",
    verificationUrl: "https://example.test/verify-email/private-test-token", expiresAt: new Date(),
  } };
}
function publicForm() {
  const data = new FormData();
  data.set("email", " Person@Example.test ");
  return data;
}
function expectSafe(result: unknown) {
  expect(JSON.stringify(result)).not.toMatch(/private-test-token|mock-email-log|verify-email\/|internal SMTP/);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "current-therapist", role: "THERAPIST" });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.resend.mockResolvedValue(outcome(EmailStatus.SENT));
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated verification resend outcomes", () => {
  it("uses only session identity and reports submission, not guaranteed inbox receipt", async () => {
    const data = publicForm();
    data.set("userId", "another-user");
    const result = await resendEmailVerificationAction(initial, data);
    expect(mocks.resend).toHaveBeenCalledExactlyOnceWith({ userId: "current-therapist" });
    expect(mocks.limit).toHaveBeenCalledWith(RATE_LIMIT_PRESETS.authResendVerification, "user:current-therapist");
    expect(result).toEqual({ status: "success", message: AUTH_MESSAGES.emailVerificationResendSubmitted });
    expect(result.message).not.toMatch(/delivered|received/i);
    expectSafe(result);
  });
  it.each([EmailStatus.FAILED, EmailStatus.PENDING])("never reports %s as sent", async status => {
    mocks.resend.mockResolvedValue(outcome(status));
    const result = await resendEmailVerificationAction(initial, new FormData());
    expect(result).toEqual({ status: "error", message: status === EmailStatus.PENDING
      ? AUTH_MESSAGES.emailVerificationResendPending : AUTH_MESSAGES.emailVerificationResendGenericError });
    expectSafe(result);
  });
  it("reports an already verified current account truthfully", async () => {
    mocks.resend.mockResolvedValue({ emailSent: false, alreadyVerified: true });
    expect(await resendEmailVerificationAction(initial, new FormData())).toEqual({
      status: "success", message: AUTH_MESSAGES.emailVerificationAlreadyVerified,
    });
  });
  it("does not report an unavailable/inactive current account as sent", async () => {
    mocks.resend.mockResolvedValue({ emailSent: false, alreadyVerified: false });
    expect(await resendEmailVerificationAction(initial, new FormData())).toEqual({
      status: "error", message: AUTH_MESSAGES.emailVerificationResendGenericError,
    });
  });
  it("sanitizes unexpected errors", async () => {
    mocks.resend.mockRejectedValue(new Error("internal SMTP private-test-token"));
    const result = await resendEmailVerificationAction(initial, new FormData());
    expect(result).toEqual({ status: "error", message: AUTH_MESSAGES.emailVerificationResendGenericError });
    expectSafe(result);
  });
  it("blocks rate-limited requests before calling token/delivery services", async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    expect(await resendEmailVerificationAction(initial, new FormData())).toEqual({ status: "error", message: AUTH_MESSAGES.rateLimited });
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(RATE_LIMIT_PRESETS.authResendVerification).toMatchObject({ limit: 3, windowMs: 15 * 60 * 1000 });
  });
});

describe("anonymous verification resend anti-enumeration", () => {
  beforeEach(() => mocks.user.mockResolvedValue(null));
  it.each([
    ["unknown/inactive", { emailSent: false, alreadyVerified: false }],
    ["already verified", { emailSent: false, alreadyVerified: true }],
    ["SENT", outcome(EmailStatus.SENT)],
    ["FAILED", outcome(EmailStatus.FAILED)],
    ["PENDING", outcome(EmailStatus.PENDING)],
  ])("returns the identical generic response for %s", async (_name, value) => {
    mocks.resend.mockResolvedValue(value);
    const result = await resendEmailVerificationAction(initial, publicForm());
    expect(result).toEqual({ status: "success", message: AUTH_MESSAGES.emailVerificationResendSuccess });
    expect(mocks.resend).toHaveBeenCalledExactlyOnceWith({ email: "person@example.test" });
    expect(mocks.limit).toHaveBeenCalledWith(RATE_LIMIT_PRESETS.authResendVerification, "email:person@example.test");
    expectSafe(result);
  });
  it("does not turn an internal exception into an account-existence signal", async () => {
    mocks.resend.mockRejectedValue(new Error("internal SMTP private-test-token"));
    const result = await resendEmailVerificationAction(initial, publicForm());
    expect(result).toEqual({ status: "success", message: AUTH_MESSAGES.emailVerificationResendSuccess });
    expectSafe(result);
  });
  it.each([null, "invalid-email"])("rejects unauthenticated missing/invalid email without service calls: %s", async value => {
    const data = new FormData();
    if (value) data.set("email", value);
    const result = await resendEmailVerificationAction(initial, data);
    expect(result.status).toBe("error");
    expect(mocks.resend).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("rate-limits by supplied normalized email before account lookup", async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    expect(await resendEmailVerificationAction(initial, publicForm())).toEqual({ status: "error", message: AUTH_MESSAGES.rateLimited });
    expect(mocks.resend).not.toHaveBeenCalled();
  });
});
