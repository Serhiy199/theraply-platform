import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/stripe/connect/refresh/route";

const createLink = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/stripe-connect.service", () => ({ createTherapistStripeAccountLink: createLink }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Stripe expired onboarding link GET", () => {
  const scenarios: Record<string, string>[] = [{}, { purpose: "prefetch", "next-router-prefetch": "1" }];
  it.each(scenarios)("returns to payout details without any Stripe operation: %j", async (headers) => {
    vi.stubEnv("APP_URL", "https://staging-or-test.example/");
    const handler: (request: NextRequest) => Promise<Response> = GET;
    const response = await handler(new NextRequest("https://localhost:3000/api/stripe/connect/refresh", { headers }));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(location.origin).toBe("https://staging-or-test.example");
    expect(location.pathname).toBe("/therapist/payout-details");
    expect(location.searchParams.get("stripe_status")).toBe("error");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createLink).not.toHaveBeenCalled();
  });
});
