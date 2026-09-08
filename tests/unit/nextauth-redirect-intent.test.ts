import { describe, expect, it } from "vitest";
import { authOptions } from "@/auth";

const redirectCallback = authOptions.callbacks?.redirect;

describe("NextAuth redirect intent", () => {
  it("preserves a relative booking callback", async () => {
    await expect(
      redirectCallback?.({
        url: "/client/book/therapist-1?source=wix",
        baseUrl: "https://staging.theraply.example",
      }),
    ).resolves.toBe(
      "https://staging.theraply.example/client/book/therapist-1?source=wix",
    );
  });

  it("preserves a same-origin absolute callback", async () => {
    await expect(
      redirectCallback?.({
        url: "https://staging.theraply.example/client/book/therapist-1",
        baseUrl: "https://staging.theraply.example",
      }),
    ).resolves.toBe(
      "https://staging.theraply.example/client/book/therapist-1",
    );
  });

  it("rejects external callbacks", async () => {
    await expect(
      redirectCallback?.({
        url: "https://evil.example/redirect",
        baseUrl: "https://staging.theraply.example",
      }),
    ).resolves.toBe("https://staging.theraply.example/");
  });
});
