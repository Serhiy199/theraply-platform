import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerAccount: vi.fn(),
  checkRateLimitPreset: vi.fn(),
  buildUserRateLimitIdentifier: vi.fn(),
}));

vi.mock("@/server/services/auth.service", () => {
  class AuthServiceError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }

  return {
    AuthServiceError,
    registerAccount: mocks.registerAccount,
  };
});

vi.mock("@/server/services/rate-limit.service", () => ({
  checkRateLimitPreset: mocks.checkRateLimitPreset,
  buildUserRateLimitIdentifier: mocks.buildUserRateLimitIdentifier,
}));

import { registerAction } from "@/app/register/actions";

function buildRegistrationForm(role: "CLIENT" | "THERAPIST", callbackUrl?: string) {
  const formData = new FormData();
  formData.set("firstName", "Test");
  formData.set("lastName", "User");
  formData.set("email", `${role.toLowerCase()}@example.com`);
  formData.set("role", role);
  formData.set("password", "StrongPass1!");
  formData.set("confirmPassword", "StrongPass1!");
  if (callbackUrl) {
    formData.set("callbackUrl", callbackUrl);
  }
  return formData;
}

describe("register action booking intent", () => {
  beforeEach(() => {
    mocks.checkRateLimitPreset.mockResolvedValue({ allowed: true });
    mocks.buildUserRateLimitIdentifier.mockReturnValue("register:test");
    mocks.registerAccount.mockResolvedValue(undefined);
  });

  it("passes a valid booking callback for client registration", async () => {
    const callbackUrl = "/client/book/therapist-1?source=wix";
    const result = await registerAction(
      { status: "idle" },
      buildRegistrationForm("CLIENT", callbackUrl),
    );

    expect(result.status).toBe("success");
    expect(mocks.registerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ role: "CLIENT" }),
      { callbackUrl },
    );
  });

  it("drops unsafe callbacks before creating a client", async () => {
    await registerAction(
      { status: "idle" },
      buildRegistrationForm("CLIENT", "https://evil.example/steal"),
    );

    expect(mocks.registerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ role: "CLIENT" }),
      { callbackUrl: null },
    );
  });

  it("does not carry client booking intent into therapist registration", async () => {
    await registerAction(
      { status: "idle" },
      buildRegistrationForm("THERAPIST", "/client/book/therapist-1"),
    );

    expect(mocks.registerAccount).toHaveBeenCalledWith(
      expect.objectContaining({ role: "THERAPIST" }),
      { callbackUrl: null },
    );
  });
});
