import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { getStripeConfig, isStripeConfigured } from "@/lib/stripe/stripe-config";
import { PLATFORM_WEBHOOK_EVENTS, verifyStripeWebhook } from "@/lib/stripe/webhook-channel";
import { enableWebhookFirstStagingGuard, WEBHOOK_FIRST_BOOKING_ID } from "../helpers/webhook-first-staging";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(), update: vi.fn(), reserve: vi.fn(), release: vi.fn(), payment: vi.fn(),
  audit: vi.fn(), diagnostic: vi.fn(), guard: vi.fn(), stripe: vi.fn(),
  completed: vi.fn(), expired: vi.fn(), succeeded: vi.fn(), failed: vi.fn(), refunded: vi.fn(),
}));
vi.mock("@/lib/stripe/stripe", () => ({ getStripeClient: mocks.stripe }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  therapistProfile: { findUnique: mocks.owner, updateMany: mocks.update },
  stripeWebhookEvent: { create: mocks.reserve, delete: mocks.release },
  payment: { update: mocks.payment },
} }));
vi.mock("@/server/services/audit-log.service", () => ({ createAuditLogEntryBestEffort: mocks.audit, logDiagnosticEvent: mocks.diagnostic }));
vi.mock("@/server/services/stripe-financial-guard.service", () => ({ assertFinancialReferencesAllowed: mocks.guard }));
vi.mock("@/server/services/payment-flow.service", () => ({
  PaymentFlowServiceError: class extends Error {},
  markStripeCheckoutSessionCompleted: mocks.completed, markStripeCheckoutSessionExpired: mocks.expired,
  markStripePaymentIntentSucceeded: mocks.succeeded, markStripePaymentIntentFailed: mocks.failed,
  markStripeChargeRefunded: mocks.refunded,
}));
import { POST } from "@/app/api/stripe/webhook/route";

const platform = "unit-platform-signing-placeholder";
const connect = "unit-connect-signing-placeholder";
const stripe = new Stripe("sk_test_unit_placeholder");
function event(type = "account.updated", livemode = false) {
  return { id: "evt_unit", object: "event", type, livemode,
    data: { object: { id: "acct_owned", payouts_enabled: true, charges_enabled: true,
      details_submitted: true, amount: 6000, amount_total: 6000, currency: "gbp",
      metadata: { bookingId: "booking", paymentId: "payment", therapistId: "untrusted" } } } };
}
function signature(body: string, secret: string) {
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret });
}
async function send(value: unknown, secret = connect, header?: string) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return POST(new NextRequest("https://example.com/api/stripe/webhook", {
    method: "POST", body, headers: { "stripe-signature": header ?? signature(body, secret) },
  }));
}
function noBusinessWrites() {
  for (const fn of [mocks.reserve, mocks.update, mocks.payment, mocks.completed, mocks.expired, mocks.succeeded, mocks.failed, mocks.refunded, mocks.audit]) {
    expect(fn).not.toHaveBeenCalled();
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_placeholder");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_unit_placeholder");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", platform);
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", connect);
  mocks.stripe.mockReturnValue(stripe);
  mocks.owner.mockResolvedValue({ id: "profile", userId: "therapist", user: { role: "THERAPIST", isActive: true } });
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.release.mockResolvedValue({});
  for (const fn of [mocks.completed, mocks.expired, mocks.succeeded, mocks.failed, mocks.refunded]) {
    fn.mockResolvedValue({ paymentId: "payment", paymentStatus: "PAID" });
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("two signed Stripe destinations (offline SDK signatures)", () => {
  it.each([[platform, "PLATFORM"], [connect, "CONNECTED_ACCOUNT"]])("classifies by verifying secret %s", (secret, channel) => {
    const body = JSON.stringify(event());
    expect(verifyStripeWebhook(stripe, body, signature(body, secret), getStripeConfig()).channel).toBe(channel);
  });
  it("keeps Connect optional for config and platform processing", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    expect(isStripeConfigured()).toBe(true);
    expect(getStripeConfig().connectWebhookSecret).toBeNull();
    expect((await send(event("checkout.session.completed"), platform)).status).toBe(200);
    expect(mocks.completed).toHaveBeenCalledOnce();
  });
  it.each(["checkout.session.completed", "payment_intent.succeeded"])("preserves signed PLATFORM processing with the booking guard active: %s", async type => {
    enableWebhookFirstStagingGuard();
    const value = event(type);
    value.data.object.metadata.bookingId = WEBHOOK_FIRST_BOOKING_ID;
    expect((await send(value, platform)).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(type === "checkout.session.completed" ? mocks.completed : mocks.succeeded).toHaveBeenCalledOnce();
  });
  it("rejects Connect signatures when absent", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    expect((await send(event())).status).toBe(400); noBusinessWrites();
  });
  it("rejects identical secrets as ambiguous configuration", async () => {
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", platform);
    expect((await send(event(), platform)).status).toBe(503); noBusinessWrites();
  });
  it.each(["wrong", "malformed", "missing", "json", "shape", "tampered"])("rejects %s without DB or sensitive diagnostics", async kind => {
    const body = kind === "json" ? "{private-sensitive-body" : kind === "shape" ? "null" : JSON.stringify(event());
    const header = kind === "malformed" ? "private-sensitive-header" : kind === "missing" ? "" : kind === "tampered" ? signature(body + " ", connect) : undefined;
    const response = await send(body, kind === "wrong" ? "wrong-unit-secret" : connect, header);
    expect(response.status).toBe(400); noBusinessWrites();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toMatch(/private-sensitive|unit-connect|unit-platform|wrong-unit/);
  });
  it.each([...PLATFORM_WEBHOOK_EVENTS])("preserves platform handler %s", async type => {
    expect((await send(event(type), platform)).status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledOnce();
    const handler = type === "checkout.session.completed" ? mocks.completed : type === "checkout.session.expired" ? mocks.expired : type === "payment_intent.succeeded" ? mocks.succeeded : type === "payment_intent.payment_failed" ? mocks.failed : type === "charge.refunded" ? mocks.refunded : mocks.payment;
    expect(handler).toHaveBeenCalledOnce(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([...PLATFORM_WEBHOOK_EVENTS])("ignores Connect financial event %s before DB access", async type => {
    expect((await send(event(type))).status).toBe(200); noBusinessWrites();
    expect(mocks.guard).not.toHaveBeenCalled(); expect(mocks.owner).not.toHaveBeenCalled();
  });
  it("ignores platform account.updated", async () => {
    expect((await send(event(), platform)).status).toBe(200); noBusinessWrites(); expect(mocks.owner).not.toHaveBeenCalled();
  });
  it.each([platform, connect])("ignores unsupported events on %s", async secret => {
    expect((await send(event("customer.created"), secret)).status).toBe(200); noBusinessWrites();
  });
  it.each([[platform, false], [platform, true], [connect, false], [connect, true]] as const)("rejects mode mismatch %s / %s before reads", async (secret, livemode) => {
    const mode = livemode ? "test" : "live";
    vi.stubEnv("STRIPE_SECRET_KEY", `sk_${mode}_unit_placeholder`);
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `pk_${mode}_unit_placeholder`);
    expect((await send(event(secret === platform ? "charge.refunded" : "account.updated", livemode), secret)).status).toBe(400);
    noBusinessWrites(); expect(mocks.owner).not.toHaveBeenCalled(); expect(mocks.guard).not.toHaveBeenCalled();
  });
  it.each([null, { id: "profile", userId: "user", user: null }, { id: "profile", userId: "user", user: { role: "CLIENT", isActive: true } }, { id: "profile", userId: "user", user: { role: "THERAPIST", isActive: false } }])("rejects unowned/non-therapist/inactive relationship %#", async owner => {
    mocks.owner.mockResolvedValue(owner);
    expect((await send(event())).status).toBe(400); noBusinessWrites();
  });
  it("rejects mismatched envelope account", async () => {
    expect((await send({ ...event(), account: "acct_other" })).status).toBe(400); noBusinessWrites(); expect(mocks.owner).not.toHaveBeenCalled();
  });
  it("keeps LIVE fixture isolation before reservation for an owned Connect account", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit_placeholder");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_unit_placeholder");
    mocks.owner.mockResolvedValue({ id: "cmsr4h3zi000poykgtg1y1s3n", userId: "cmsr4h3zf000noykga45ku6za", user: { role: "THERAPIST", isActive: true } });
    expect((await send(event("account.updated", true))).status).toBe(400); noBusinessWrites();
  });
  it("releases reservation on failed owned update for a later retry", async () => {
    mocks.update.mockResolvedValueOnce({ count: 0 });
    expect((await send(event())).status).toBe(400);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("updates only canonical Stripe fields pinned to stored owner, never metadata", async () => {
    expect((await send(event())).status).toBe(200);
    expect(mocks.owner).toHaveBeenCalledWith(expect.objectContaining({ where: { stripeAccountId: "acct_owned" } }));
    const update = mocks.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "profile", userId: "therapist", stripeAccountId: "acct_owned", user: { role: "THERAPIST", isActive: true } });
    expect(Object.keys(update.data).sort()).toEqual(["stripeOnboardingStatus", "stripeChargesEnabled", "stripePayoutsEnabled", "stripeDetailsSubmitted", "stripeOnboardingCompletedAt", "stripeAccountSyncedAt", "stripeRequirementsDue", "stripeDisabledReason"].sort());
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "profile", action: "STRIPE_CONNECT_ACCOUNT_UPDATED" }));
  });
  it("deduplicates event ID without a second status mutation", async () => {
    mocks.reserve.mockResolvedValueOnce({}).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "unit" }));
    expect((await send(event())).status).toBe(200);
    expect((await send(event())).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("does not acknowledge DB reservation outages as duplicate success", async () => {
    mocks.reserve.mockRejectedValue(new Error("database unavailable"));
    expect((await send(event())).status).toBe(500); expect(mocks.update).not.toHaveBeenCalled();
  });
});
