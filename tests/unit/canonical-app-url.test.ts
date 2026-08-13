import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCanonicalAppUrl,
  CanonicalAppUrlConfigError,
} from "@/lib/urls/canonical-app-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canonical application URL", () => {
  it("prefers APP_URL over NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("APP_URL", "https://app.example/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public.example");

    expect(buildCanonicalAppUrl("/api/stripe/connect/return").toString()).toBe(
      "https://app.example/api/stripe/connect/return",
    );
  });

  it("uses NEXT_PUBLIC_APP_URL when APP_URL is absent", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.example/");

    expect(buildCanonicalAppUrl("/therapist/payout-details").toString()).toBe(
      "https://staging.example/therapist/payout-details",
    );
  });

  it("uses localhost only outside production", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "test");

    expect(buildCanonicalAppUrl("/login").toString()).toBe("http://localhost:3000/login");
  });

  it("fails safely when production has no canonical URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => buildCanonicalAppUrl("/login")).toThrowError(CanonicalAppUrlConfigError);
  });

  it("rejects invalid or non-HTTP configured URLs", () => {
    vi.stubEnv("APP_URL", "file:///tmp/theraply");

    expect(() => buildCanonicalAppUrl("/login")).toThrowError(CanonicalAppUrlConfigError);
  });
});
