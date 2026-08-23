import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/stripe/checkout/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireCurrentActionRoleMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());
const createClientStripeCheckoutSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();

  return {
    ...actual,
    requireCurrentActionRole: requireCurrentActionRoleMock,
  };
});
vi.mock("@/server/services/rate-limit.service", () => ({
  buildUserRateLimitIdentifier: vi.fn(() => "stripe:user:client-user-id"),
  checkRateLimitPreset: checkRateLimitPresetMock,
  getRateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/server/services/payment-flow.service", () => ({
  PaymentFlowServiceError: class PaymentFlowServiceError extends Error {},
  createClientStripeCheckoutSession: createClientStripeCheckoutSessionMock,
}));

const clientUser = {
  id: "client-user-id",
  email: "client@example.com",
  role: UserRole.CLIENT,
};

async function callRoute(requestOrigin: string, bookingId = "booking/id with spaces") {
  return POST(
    new NextRequest(`${requestOrigin}/api/stripe/checkout`, {
      method: "POST",
      body: JSON.stringify({ bookingId, promoCode: "SAVE5" }),
      headers: { "content-type": "application/json" },
    }),
  );
}

function getCheckoutUrls() {
  const input = createClientStripeCheckoutSessionMock.mock.calls[0]?.[1] as {
    successUrl: string;
    cancelUrl: string;
  };

  return input;
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://platform.theraply.online");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://public-fallback.example");
  getCurrentUserMock.mockResolvedValue(clientUser);
  requireCurrentActionRoleMock.mockResolvedValue(clientUser);
  checkRateLimitPresetMock.mockResolvedValue({ allowed: true });
  createClientStripeCheckoutSessionMock.mockResolvedValue({
    checkoutUrl: "https://checkout.stripe.test/session",
    sessionId: "checkout-session-id",
    paymentId: "payment-id",
    amount: 6000,
    chargeAmount: 5700,
    creditAppliedAmount: 0,
    promoCode: "SAVE5",
    promoDiscountPercent: 5,
    promoDiscountAmount: 300,
    clientPayableAmount: 5700,
    currency: "gbp",
    expiresAt: new Date("2026-08-25T00:00:00.000Z"),
    completedFromCredit: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/stripe/checkout canonical redirects", () => {
  it.each([
    "https://localhost:3000",
    "http://127.0.0.1:3000",
  ])("ignores the internal request origin %s", async (requestOrigin) => {
    const response = await callRoute(requestOrigin);
    const { successUrl, cancelUrl } = getCheckoutUrls();

    expect(response.status).toBe(200);
    expect(successUrl).toBe(
      "https://platform.theraply.online/client/payments/success?bookingId=booking%2Fid+with+spaces&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(cancelUrl).toBe(
      "https://platform.theraply.online/client/payments/failed?bookingId=booking%2Fid+with+spaces&reason=cancelled",
    );
    expect(`${successUrl}\n${cancelUrl}`).not.toMatch(/localhost|127\.0\.0\.1|:3000/);
    expect(successUrl).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(successUrl).not.toContain("%7BCHECKOUT_SESSION_ID%7D");
  });

  it("uses the configured non-production canonical host", async () => {
    vi.stubEnv("APP_URL", "https://theraply-preview.example/");

    await callRoute("http://127.0.0.1:3000", "preview-booking");
    const { successUrl, cancelUrl } = getCheckoutUrls();

    expect(new URL(successUrl).origin).toBe("https://theraply-preview.example");
    expect(new URL(cancelUrl).origin).toBe("https://theraply-preview.example");
    expect(new URL(successUrl).searchParams.get("bookingId")).toBe("preview-booking");
    expect(new URL(cancelUrl).searchParams.get("reason")).toBe("cancelled");
  });

  it("falls back to NEXT_PUBLIC_APP_URL without trusting the request host", async () => {
    vi.stubEnv("APP_URL", "");

    await callRoute("https://attacker.example", "fallback-booking");
    const { successUrl, cancelUrl } = getCheckoutUrls();

    expect(new URL(successUrl).origin).toBe("https://public-fallback.example");
    expect(new URL(cancelUrl).origin).toBe("https://public-fallback.example");
    expect(successUrl).not.toContain("attacker.example");
    expect(cancelUrl).not.toContain("attacker.example");
  });
});
