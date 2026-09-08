import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tokenUpdateMany: vi.fn(),
  tokenCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/server/services/email-delivery.service", () => ({
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("@/server/services/audit-log.service", () => ({
  createAuditLogEntryBestEffort: vi.fn(),
}));

import { createEmailVerificationForUser } from "@/server/services/email-verification.service";

describe("email verification booking intent", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://staging.theraply.example/");
    mocks.tokenUpdateMany.mockResolvedValue({ count: 0 });
    mocks.tokenCreate.mockResolvedValue({ id: "verification-token-id" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        emailVerificationToken: {
          updateMany: mocks.tokenUpdateMany,
          create: mocks.tokenCreate,
        },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds an encoded safe booking callback to the verification URL", async () => {
    const result = await createEmailVerificationForUser(
      { id: "user-id", email: "client@example.com", firstName: "Client" },
      "/client/book/therapist-1?source=wix&campaign=summer",
    );
    const verificationUrl = new URL(result.verificationUrl);

    expect(verificationUrl.origin).toBe("https://staging.theraply.example");
    expect(verificationUrl.pathname).toBe(`/verify-email/${result.token}`);
    expect(verificationUrl.searchParams.get("callbackUrl")).toBe(
      "/client/book/therapist-1?source=wix&campaign=summer",
    );
  });

  it("omits unsafe callback values from the verification URL", async () => {
    const result = await createEmailVerificationForUser(
      { id: "user-id", email: "client@example.com" },
      "https://evil.example/redirect",
    );

    expect(new URL(result.verificationUrl).searchParams.has("callbackUrl")).toBe(false);
  });
});
