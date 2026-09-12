import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeRuntimeMode } from "@/lib/stripe/runtime-mode";
import { assertStripeFinancialContext, isProductionTestFixture, PRODUCTION_TEST_THERAPIST } from "@/lib/stripe/test-fixture";
import { evaluateTherapistReadiness, buildBookableTherapistWhere } from "@/lib/therapist-readiness";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), transaction: vi.fn(), findUnique: vi.fn(), reserve: vi.fn(), updateMany: vi.fn(), audit: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findFirst: mocks.findFirst }, therapistProfile: { findFirst: mocks.findUnique, findUnique: mocks.findUnique, updateMany: mocks.updateMany }, stripeWebhookEvent: { create: mocks.reserve }, $transaction: mocks.transaction } }));
vi.mock("@/lib/stripe/stripe", () => ({ getStripeClient: mocks.stripe }));
vi.mock("@/server/services/audit-log.service", () => ({ createAuditLogEntryBestEffort: mocks.audit, logDiagnosticEvent: vi.fn() }));
import { createClientStripeCheckoutSession } from "@/server/services/payment-flow.service";
import { refundClientCancellationIfEligible } from "@/server/services/refund.service";
import { createTherapistTransferForBooking } from "@/server/services/therapist-transfer.service";
import { issueClientCredit } from "@/server/services/client-credit.service";
import { createTherapistStripeAccountLink } from "@/server/services/stripe-connect.service";
import { processStripeWebhookEventBestEffort } from "@/server/services/stripe-webhook.service";
import { assertFinancialReferencesAllowed } from "@/server/services/stripe-financial-guard.service";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/stripe/webhook/route";

function mode(value: "test" | "live") {
  vi.stubEnv("STRIPE_SECRET_KEY", `sk_${value}_unit_placeholder`);
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `pk_${value}_unit_placeholder`);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "unit-placeholder");
}
beforeEach(() => { vi.clearAllMocks(); mode("live"); mocks.findFirst.mockResolvedValue({ therapistId: PRODUCTION_TEST_THERAPIST.userId, payment: null }); });
afterEach(() => vi.unstubAllEnvs());

describe("minimal Stripe LIVE isolation", () => {
  it.each(["test", "live"] as const)("recognizes %s", m => { mode(m); expect(getStripeRuntimeMode()).toBe(m.toUpperCase()); });
  it("rejects mixed keys", () => { vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_placeholder"); expect(getStripeRuntimeMode).toThrow("STRIPE_MODE_MISMATCH"); });
  it("rejects missing/invalid mode", () => { vi.stubEnv("STRIPE_SECRET_KEY", ""); expect(getStripeRuntimeMode).toThrow("STRIPE_MODE_INVALID"); });
  it("detects fixture by user and profile independently", () => {
    expect(isProductionTestFixture({ therapistId: PRODUCTION_TEST_THERAPIST.userId })).toBe(true);
    expect(isProductionTestFixture({ profileId: PRODUCTION_TEST_THERAPIST.profileId })).toBe(true);
  });
  it("blocks new LIVE checkout for fixture even without Payment", async () => {
    await expect(createClientStripeCheckoutSession("client", { bookingId: "unpaid-test-booking", successUrl: "https://example.com/s", cancelUrl: "https://example.com/c" })).rejects.toThrow("TEST_FIXTURE_FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("blocks persisted TEST session for otherwise real therapist", () => {
    expect(() => assertStripeFinancialContext({ therapistId: "real", payment: { stripeCheckoutSessionId: "cs_test_previous" } })).toThrow("TEST_FIXTURE_FORBIDDEN");
  });
  it("allows normal real booking guard", async () => {
    mocks.findFirst.mockResolvedValue({ therapistId: "real", payment: null });
    await expect(assertFinancialReferencesAllowed(prisma, { bookingId: "real" })).resolves.toBeUndefined();
  });
  it("allows a real checkout to reach its normal transaction", async () => {
    mocks.findFirst.mockResolvedValue({ therapistId: "real", payment: null });
    mocks.transaction.mockRejectedValueOnce(new Error("NORMAL_CHECKOUT_REACHED"));
    await expect(createClientStripeCheckoutSession("client", { bookingId: "real", successUrl: "https://example.com/s", cancelUrl: "https://example.com/c" })).rejects.toThrow("NORMAL_CHECKOUT_REACHED");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it.each([refundClientCancellationIfEligible, createTherapistTransferForBooking])("blocks financial service before mutation", async fn => {
    await expect(fn("test-booking", "actor")).rejects.toThrow("TEST_FIXTURE_FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.stripe).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each(["cmt5icu4r0031oyaj4154pr5m", "cmt5jqmmv004boyajwil76u9m", "cmt5k285r004zoyajo7uc91pw", "cmt5rc59q000hoycw4se0znay", "cmt5t98x1000hoy2gr9een7a7"])("blocks historical ID %s even if relationship cannot be read", async paymentId => {
    await expect(assertFinancialReferencesAllowed(prisma, { paymentId })).rejects.toThrow("TEST_FIXTURE_FORBIDDEN");
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("blocks credit compensation inside transaction before writes", async () => {
    mocks.transaction.mockImplementation(fn => fn(prisma));
    await expect(issueClientCredit({ clientId: "client", bookingId: "test", amount: 500 })).rejects.toThrow("TEST_FIXTURE_FORBIDDEN");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("blocks TEST Connect account reuse before Stripe", async () => {
    await expect(createTherapistStripeAccountLink(PRODUCTION_TEST_THERAPIST.userId)).rejects.toThrow("TEST_FIXTURE_FORBIDDEN");
    expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it.each([false, true])("rejects mismatched webhook before any DB reservation (%s)", async livemode => {
    mode(livemode ? "test" : "live");
    await expect(processStripeWebhookEventBestEffort({ id: "event", type: "account.updated", livemode } as Stripe.Event)).rejects.toThrow("STRIPE_EVENT_MODE_MISMATCH");
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.findUnique).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("rejects unknown account ownership before reservation", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(processStripeWebhookEventBestEffort({ id: "event", type: "account.updated", livemode: true, data: { object: { id: "acct_unknown" } } } as Stripe.Event)).rejects.toThrow("STRIPE_ACCOUNT_UNOWNED");
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.updateMany).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("route rejects signed mode mismatch before reservation or audit", async () => {
    mocks.stripe.mockReturnValue({ webhooks: { constructEvent: () => ({ livemode: false }) } });
    const response = await POST(new NextRequest("https://example.com/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "unit" }, body: "unit" }));
    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("signature failure never records sensitive exception text", async () => {
    const error = Object.setPrototypeOf(new Error("private-payload-must-not-log"), Stripe.errors.StripeSignatureVerificationError.prototype);
    mocks.stripe.mockReturnValue({ webhooks: { constructEvent: () => { throw error; } } });
    const response = await POST(new NextRequest("https://example.com/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "unit" }, body: "private-payload-must-not-log" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private-payload-must-not-log");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each([false, true])("allows matching webhook with stored ownership (%s)", async livemode => {
    mode(livemode ? "live" : "test"); mocks.findUnique.mockResolvedValue({ id: "real-profile", userId: "real", user: { role: "THERAPIST", isActive: true } }); mocks.updateMany.mockResolvedValue({ count: 1 });
    await processStripeWebhookEventBestEffort({ id: "event", type: "account.updated", livemode, account: "acct_owned", data: { object: { id: "acct_owned", payouts_enabled: true, details_submitted: true } } } as Stripe.Event);
    expect(mocks.reserve).toHaveBeenCalledOnce(); expect(mocks.updateMany).toHaveBeenCalledOnce();
  });
  it("stale TEST flags cannot satisfy LIVE readiness", () => {
    const result = evaluateTherapistReadiness({ user: { id: PRODUCTION_TEST_THERAPIST.userId, role: "THERAPIST", isActive: true, emailVerified: true }, profile: { id: PRODUCTION_TEST_THERAPIST.profileId, stripeAccountId: "acct_old", stripePayoutsEnabled: true, stripeDetailsSubmitted: true } });
    expect(result.publicReady).toBe(false); expect(result.reasons).toContain("STRIPE_NOT_READY"); expect(buildBookableTherapistWhere().id).toEqual({ not: PRODUCTION_TEST_THERAPIST.userId });
  });
  it.each(["cmshsjoaq0002oyba2vmt9jo0", "cmshsjob20007oybanzpmp344", "cmshsjob8000coybas78g91ri", "cmshsjp3f000loyba5r7lqw7v", "cmshsjqgf000yoybaw3nc95b9"])("real imported profile %s is not blocked", async id => {
    expect(isProductionTestFixture({ profileId: id })).toBe(false);
    expect(() => assertStripeFinancialContext({ profileId: id })).not.toThrow();
    expect(evaluateTherapistReadiness({ user: { role: "THERAPIST" }, profile: { id, stripeAccountId: null } }).reasons).toContain("STRIPE_NOT_READY");
    mocks.findUnique.mockResolvedValue({ id, stripeAccountId: null });
    mocks.stripe.mockImplementationOnce(() => { throw new Error("NORMAL_CONNECT_REACHED"); });
    await expect(createTherapistStripeAccountLink(`real-user-${id}`)).rejects.toThrow("NORMAL_CONNECT_REACHED");
    expect(mocks.stripe).toHaveBeenCalledOnce();
  });
});
