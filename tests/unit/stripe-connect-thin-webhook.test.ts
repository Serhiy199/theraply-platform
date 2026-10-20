import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { verifyStripeWebhook } from "@/lib/stripe/webhook-channel";
import { isStripeConnectReady } from "@/lib/stripe/stripe-connect-readiness";
import { evaluateTherapistReadiness } from "@/lib/therapist-readiness";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), update: vi.fn(), reserve: vi.fn(), transaction: vi.fn(), audit: vi.fn(), diagnostic: vi.fn(), stripe: vi.fn(), retrieve: vi.fn() }));
vi.mock("@/lib/stripe/stripe", () => ({ getStripeClient: mocks.stripe }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/services/audit-log.service", () => ({ createAuditLogEntryBestEffort: mocks.audit, logDiagnosticEvent: mocks.diagnostic }));
import { POST } from "@/app/api/stripe/webhook/route";

const connectSecret = "unit-thin-connect-placeholder";
const platformSecret = "unit-thin-platform-placeholder";
const sdk = new Stripe("sk_test_unit_placeholder");
const tx = { stripeWebhookEvent: { create: mocks.reserve }, therapistProfile: { findUnique: mocks.owner, updateMany: mocks.update } };
let committedEvents = new Set<string>();
let committedUpdates: unknown[] = [];
let stagedEvents: Set<string>;
let stagedUpdates: unknown[];

function account(ready = true) {
  return { id: "acct_owned", object: "account", controller: { is_controller: true },
    details_submitted: ready, payouts_enabled: ready, charges_enabled: ready,
    requirements: { currently_due: ready ? [] : ["external_account"], eventually_due: [], past_due: [], disabled_reason: null },
    metadata: { therapistId: "not-the-owner" } };
}
async function send(event: unknown, secret = connectSecret, header?: string) {
  const body = typeof event === "string" ? event : JSON.stringify(event);
  return POST(new NextRequest("https://example.com/api/stripe/webhook", { method: "POST", body,
    headers: { "stripe-signature": header ?? sdk.webhooks.generateTestHeaderString({ payload: body, secret }) } }));
}
function noState() {
  expect(committedEvents.size).toBe(0);
  expect(committedUpdates).toEqual([]);
  expect(mocks.audit).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_placeholder");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_unit_placeholder");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", platformSecret);
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", connectSecret);
  committedEvents = new Set(); committedUpdates = [];
  mocks.stripe.mockReturnValue({ webhooks: sdk.webhooks, parseEventNotification: sdk.parseEventNotification.bind(sdk), accounts: { retrieve: mocks.retrieve } });
  mocks.retrieve.mockResolvedValue(account());
  mocks.owner.mockResolvedValue({ id: "profile", userId: "therapist", user: { role: "THERAPIST", isActive: true } });
  mocks.reserve.mockImplementation(async ({ data }) => {
    if (stagedEvents.has(data.id)) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "unit" });
    stagedEvents.add(data.id);
  });
  mocks.update.mockImplementation(async input => { stagedUpdates.push(input); return { count: 1 }; });
  // Simulate commit/rollback, so failure assertions check persisted state, not just calls.
  mocks.transaction.mockImplementation(async callback => {
    stagedEvents = new Set(committedEvents); stagedUpdates = [...committedUpdates];
    const result = await callback(tx);
    committedEvents = stagedEvents; committedUpdates = stagedUpdates;
    return result;
  });
});
afterEach(() => vi.unstubAllEnvs());

const readinessNotifications = [
  ["v2.core.account.updated", null],
  ["v2.core.account[identity].updated", "identity"],
  ["v2.core.account[requirements].updated", "requirements"],
  ["v2.core.account[configuration.recipient].capability_status_updated", "configuration.recipient"],
  ["v2.core.account[configuration.merchant].capability_status_updated", "configuration.merchant"],
] as const;

describe.each(readinessNotifications)("Connect V2 thin webhook %s (signed offline, mocked API/DB)", (type, include) => {
  function thin(livemode = false) {
    const query = include ? `?include=${include}` : "";
    return { id: "evt_thin_unit", object: "v2.core.event", type, livemode,
      created: "2026-10-12T08:00:00.435Z", context: null,
      related_object: { id: "acct_owned", type: "v2.core.account", url: `/v2/core/accounts/acct_owned${query}` } };
  }

  it("uses the thin SDK parser without requiring data.object", () => {
    const body = JSON.stringify(thin());
    const header = sdk.webhooks.generateTestHeaderString({ payload: body, secret: connectSecret });
    const parsed = verifyStripeWebhook(sdk, body, header, { webhookSecret: platformSecret, connectWebhookSecret: connectSecret });
    expect(parsed.kind).toBe("CONNECT_V2_THIN"); expect(parsed.channel).toBe("CONNECTED_ACCOUNT");
    expect(parsed.event.id).toBe("evt_thin_unit");
  });
  it("keeps platform-first source selection even if a header has signatures for both secrets", async () => {
    const body = JSON.stringify(thin());
    const timestamp = Math.floor(Date.now() / 1000);
    const first = sdk.webhooks.generateTestHeaderString({ payload: body, secret: platformSecret, timestamp });
    const second = sdk.webhooks.generateTestHeaderString({ payload: body, secret: connectSecret, timestamp });
    expect((await send(body, connectSecret, first + "," + second.split(",")[1])).status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled(); noState();
  });
  it.each([false, true])("accepts matching mode %s and fetches once before canonical mutation", async livemode => {
    vi.stubEnv("STRIPE_SECRET_KEY", `sk_${livemode ? "live" : "test"}_unit_placeholder`);
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `pk_${livemode ? "live" : "test"}_unit_placeholder`);
    expect((await send(thin(livemode))).status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith("acct_owned", {}, { timeout: 5000, maxNetworkRetries: 0 });
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.retrieve.mock.invocationCallOrder[0]);
    expect(mocks.retrieve.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(committedEvents.size).toBe(1); expect(committedUpdates).toHaveLength(1);
    expect(mocks.reserve).toHaveBeenCalledWith({ data: { id: "evt_thin_unit", eventType: type } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "TherapistProfile", entityId: "profile", action: "STRIPE_CONNECT_ACCOUNT_UPDATED" }));
  });
  it("also accepts the base account URL without an include query", async () => {
    const event = thin();
    event.related_object.url = "/v2/core/accounts/acct_owned";
    expect((await send(event)).status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith("acct_owned", {}, { timeout: 5000, maxNetworkRetries: 0 });
  });
  it.each([
    "?include=configuration.customer", "?include=identity&include=requirements",
    "?include=identity&api_key=private", "?expand=identity", "#private",
    "?include=identity#private", "/../acct_other", "%0d%0aPrivate:header",
  ])("rejects non-contract related account URL suffix %s", async suffix => {
    const event = thin();
    event.related_object.url = `/v2/core/accounts/acct_owned${suffix}`;
    expect((await send(event)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled(); noState();
  });
  it.each(["v2.core.account[configuration.customer].updated", "v2.core.account_person.updated", "v1.billing.meter.error_report_triggered"])("does not allow an unrelated event family: %s", async unsupported => {
    expect((await send({ ...thin(), type: unsupported })).status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled(); noState();
  });
  it("uses current authoritative state instead of notification data", async () => {
    expect((await send({ ...thin(), data: { object: { ...account(false), id: "acct_untrusted" } } })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      stripeDetailsSubmitted: true, stripePayoutsEnabled: true, stripeChargesEnabled: true,
    }) }));
  });
  it.each([false, true])("mode mismatch %s performs neither reservation nor fetch", async livemode => {
    vi.stubEnv("STRIPE_SECRET_KEY", `sk_${livemode ? "test" : "live"}_unit_placeholder`);
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `pk_${livemode ? "test" : "live"}_unit_placeholder`);
    expect((await send(thin(livemode))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled(); noState();
  });
  it.each(["wrong-secret", "malformed", "expired", "absent-connect", "platform-thin"])("rejects %s before DB/API", async kind => {
    if (kind === "absent-connect") vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");
    const body = JSON.stringify(thin());
    const header = kind === "malformed" ? "sensitive-header" : kind === "expired" ? sdk.webhooks.generateTestHeaderString({ payload: body, secret: connectSecret, timestamp: 1 }) : undefined;
    expect((await send(body, kind === "wrong-secret" ? "wrong-placeholder" : kind === "platform-thin" ? platformSecret : connectSecret, header)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled(); noState();
  });
  it.each([
    { related_object: null }, { related_object: {} }, { related_object: { id: "acct_owned", type: "account", url: "/v2/core/accounts/acct_owned" } },
    { related_object: { id: "acct_owned", type: "v2.core.account", url: "https://untrusted.example/private" } },
    { related_object: { id: "acct_owned", type: "v2.core.account", url: "/v2/core/accounts/acct_other" } },
    { created: 123 }, { created: "invalid" }, { id: "" }, { livemode: "false" }, { type: "v2.core.account.created" },
    { context: 7 }, { context: {} }, { context: "acct_owned\r\nSecret: private" }, { context: "" },
    { object: "event", data: { object: account() } },
  ])("rejects malformed notification %#", async mutation => {
    expect((await send({ ...thin(), ...mutation })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled(); noState();
  });
  it("rejects signed malformed JSON safely", async () => {
    expect((await send("{sensitive-body")).status).toBe(400);
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("sensitive-body"); noState();
  });
  it.each(["acct_owned", "acct_platform/acct_owned"])("preserves verified context %s in retrieval options", async context => {
    expect((await send({ ...thin(), context })).status).toBe(200);
    const opts = mocks.retrieve.mock.calls[0][2];
    expect(opts.stripeContext.toString()).toBe(context);
    expect(opts.apiKey).toBeUndefined();
  });
  it("retries after transient retrieval failure without persisted reservation or stale status", async () => {
    mocks.retrieve.mockRejectedValueOnce(new Error("sensitive-provider-error"));
    const response = await send(thin());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "TRANSIENT_FETCH_FAILURE" });
    noState(); expect(mocks.update).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("sensitive-provider-error");
    expect((await send(thin())).status).toBe(200);
    expect(committedUpdates).toHaveLength(1); expect(committedEvents.size).toBe(1);
  });
  it("duplicate committed delivery does not fetch or mutate twice", async () => {
    expect((await send(thin())).status).toBe(200);
    expect((await send(thin())).status).toBe(200);
    expect(mocks.retrieve).toHaveBeenCalledOnce(); expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.audit).toHaveBeenCalledOnce();
    expect(committedUpdates).toHaveLength(1);
  });
  it("rolls back reservation when the guarded update loses ownership", async () => {
    mocks.update.mockResolvedValueOnce({ count: 0 });
    expect((await send(thin())).status).toBe(400); noState();
    expect((await send(thin())).status).toBe(200);
    expect(committedEvents.size).toBe(1); expect(committedUpdates).toHaveLength(1);
  });
  it("does not misclassify a non-reservation unique failure as already processed", async () => {
    mocks.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private-db-error", { code: "P2002", clientVersion: "unit" }));
    expect((await send(thin())).status).toBe(500);
    expect(committedEvents.size).toBe(0); expect(committedUpdates).toEqual([]);
    expect(JSON.stringify(mocks.diagnostic.mock.calls)).not.toContain("private-db-error");
  });
  it.each([null, { id: "profile", userId: "user", user: null }, { id: "profile", userId: "user", user: { role: "CLIENT", isActive: true } }, { id: "profile", userId: "user", user: { role: "THERAPIST", isActive: false } }])("rejects missing or wrong stored owner %#", async owner => {
    mocks.owner.mockResolvedValue(owner);
    expect((await send(thin())).status).toBe(400); noState(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([{ id: "acct_other" }, { controller: { is_controller: false } }])("rejects wrong authoritative account identity/platform %#", async mutation => {
    mocks.retrieve.mockResolvedValue({ ...account(), ...mutation });
    expect((await send(thin())).status).toBe(400); noState();
  });
  it("rejects account not reachable using the configured platform key", async () => {
    mocks.retrieve.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({ message: "private-response", code: "resource_missing" }));
    expect((await send(thin())).status).toBe(400); noState();
  });
  it.each(["details_submitted", "payouts_enabled", "charges_enabled"])("does not fabricate missing authoritative %s", async field => {
    mocks.retrieve.mockResolvedValue({ ...account(), [field]: undefined });
    expect((await send(thin())).status).toBe(503); noState();
  });
  it.each([false, true])("retains existing readiness criterion for completion=%s", async ready => {
    mocks.retrieve.mockResolvedValue(account(ready));
    expect((await send(thin())).status).toBe(200);
    const input = mocks.update.mock.calls[0][0];
    expect(input.where).toEqual({ id: "profile", userId: "therapist", stripeAccountId: "acct_owned", user: { role: "THERAPIST", isActive: true } });
    expect(Object.keys(input.data).every(k => k.startsWith("stripe"))).toBe(true);
    const profile = { stripeAccountId: "acct_owned", ...input.data };
    expect(isStripeConnectReady(profile)).toBe(ready);
    expect(evaluateTherapistReadiness({ user: { role: "THERAPIST", isActive: true }, profile }).reasons.includes("STRIPE_NOT_READY")).toBe(!ready);
  });
  it("preserves LIVE fixture guard and rolls back the event", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_unit_placeholder"); vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_unit_placeholder");
    mocks.owner.mockResolvedValue({ id: "cmsr4h3zi000poykgtg1y1s3n", userId: "cmsr4h3zf000noykga45ku6za", user: { role: "THERAPIST", isActive: true } });
    expect((await send(thin(true))).status).toBe(400); noState(); expect(mocks.update).not.toHaveBeenCalled();
  });
});
