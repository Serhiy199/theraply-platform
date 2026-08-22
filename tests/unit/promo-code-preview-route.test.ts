import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionPermissionError } from "@/lib/permissions";
import { PaymentFlowServiceError } from "@/server/services/payment-flow.service";
import { POST } from "@/app/api/promocodes/preview/route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const requireCurrentActionRoleMock = vi.hoisted(() => vi.fn());
const previewClientPromoCodeMock = vi.hoisted(() => vi.fn());
const checkRateLimitPresetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));

vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return { ...actual, requireCurrentActionRole: requireCurrentActionRoleMock };
});

vi.mock("@/server/services/payment-flow.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/payment-flow.service")>();
  return { ...actual, previewClientPromoCode: previewClientPromoCodeMock };
});

vi.mock("@/server/services/rate-limit.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/rate-limit.service")>();
  return { ...actual, checkRateLimitPreset: checkRateLimitPresetMock };
});

const clientUser = { id: "client-id", email: "client@example.com", role: "CLIENT" };

function buildRequest(payload: unknown = { bookingId: "booking-id", promoCode: "SAVE5" }) {
  return new Request("http://localhost/api/promocodes/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  getCurrentUserMock.mockResolvedValue(clientUser);
  requireCurrentActionRoleMock.mockResolvedValue(clientUser);
  checkRateLimitPresetMock.mockResolvedValue({
    allowed: true,
    limit: 20,
    remaining: 19,
    resetAt: new Date("2026-08-22T20:00:00Z"),
    retryAfterSeconds: 0,
  });
  previewClientPromoCodeMock.mockResolvedValue({
    valid: true,
    normalizedCode: "SAVE5",
    discountPercent: 5,
    promoDiscountAmount: 500,
    grossAmount: 10000,
    clientPayableAmount: 9500,
    projectedCreditAppliedAmount: 0,
    projectedStripeChargeAmount: 9500,
    currency: "gbp",
  });
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/promocodes/preview", () => {
  it("rejects unauthenticated requests", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await POST(buildRequest() as never);
    expect(response.status).toBe(401);
    expect(previewClientPromoCodeMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-client roles", async () => {
    requireCurrentActionRoleMock.mockRejectedValue(new ActionPermissionError());
    const response = await POST(buildRequest() as never);
    expect(response.status).toBe(403);
    expect(previewClientPromoCodeMock).not.toHaveBeenCalled();
  });

  it("validates payload before previewing", async () => {
    const response = await POST(buildRequest({ bookingId: "", promoCode: "" }) as never);
    expect(response.status).toBe(400);
    expect(previewClientPromoCodeMock).not.toHaveBeenCalled();
  });

  it("returns only the safe preview contract", async () => {
    const response = await POST(buildRequest() as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        valid: true,
        normalizedCode: "SAVE5",
        projectedStripeChargeAmount: 9500,
      }),
    );
    expect(previewClientPromoCodeMock).toHaveBeenCalledWith("client-id", {
      bookingId: "booking-id",
      promoCode: "SAVE5",
    });
  });

  it("returns one safe response for unknown, inactive, or expired promos", async () => {
    previewClientPromoCodeMock.mockRejectedValue(
      new PaymentFlowServiceError("internal reason", "PROMO_CODE_INVALID"),
    );
    const response = await POST(buildRequest() as never);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "PROMO_CODE_INVALID",
      error: "This promo code is invalid or unavailable.",
    });
  });
});
