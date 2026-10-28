import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ActionPermissionError } from "@/lib/permissions";
import { GET, POST } from "@/app/api/admin/wix02a/route";
import { assertWix02aRuntime, runWix02a } from "@/server/services/wix02a-runtime.service";
import { enableWixStagingIsolation } from "../helpers/wix-staging-isolation";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), role: vi.fn(), transaction: vi.fn(), executeRaw: vi.fn(), query: vi.fn(),
  hashes: vi.fn(), profile: vi.fn(), collection: vi.fn(), indexes: vi.fn(), inventory: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/permissions", async original => ({ ...await original<typeof import("@/lib/permissions")>(), requireCurrentActionRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/wix/wix-cms-client", () => ({ getWixCmsTherapistsCollection: mocks.collection,
  listWixCmsTherapistIndexes: mocks.indexes, listAllWixCmsTherapists: mocks.inventory }));
vi.mock("@/server/services/wix-cms-therapist-sync.service", () => ({
  wixCmsTherapistProfileSelect: { id: true }, reconcileTherapistPublicProfile: mocks.reconcile,
}));

const profileId = "cmqmkg8sq0008ky04m764ti7d";
const itemId = "d65eb481-cb1e-446a-a6b2-7ec91405b873";
const origin = "https://theraply-platform.vercel.app";
let items: Array<{ id: string; revision: string; data: Record<string, unknown> }>;

function request(body = "mode=preflight", extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/admin/wix02a`, { method: "POST", body,
    headers: { origin, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...extraHeaders } });
}

beforeEach(() => {
  enableWixStagingIsolation("cmvgohrvy0002jm0849lxxax0");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
  vi.stubEnv("WIX_CMS_SITE_ID", "80d72d55-7ad6-4efd-8091-c82ec66fb286");
  vi.stubEnv("WIX_CMS_API_TOKEN", "test-placeholder-token");
  vi.stubEnv("WIX_CMS_AUTOMATION_ENABLED", "");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
  mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.role.mockResolvedValue({ id: "admin", role: "ADMIN" });
  mocks.query.mockImplementation(async (strings: TemplateStringsArray | { sql: string }) => {
    const sql = "sql" in strings ? strings.sql : String(strings[0]);
    if (sql.includes("md5")) return mocks.hashes();
    return sql.includes("pg_try_advisory") ? [{ acquired: true }] : [{ database: "postgres", schema: "public", readonly: "on" }];
  });
  mocks.hashes.mockResolvedValue([{ count: "1", fingerprint: "unchanged" }]);
  mocks.transaction.mockImplementation(async callback => callback({ $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.query, therapistProfile: { findUnique: mocks.profile } }));
  mocks.profile.mockResolvedValue({ id: profileId, user: { id: "cmqmkg8nh0006ky04qmn87vau", role: "THERAPIST", isActive: true, emailVerified: true },
    displayName: "Controlled profile", bio: "Biography", specialization: "Specialization", therapyServicesProvided: "Therapy", yearsOfExperience: "5",
    profilePhotoUrl: "https://example.com/photo.jpg", sessionPricePence: 100, approvalStatus: "APPROVED", isApproved: true, onboardingCompleted: true,
    isGoogleCalendarConnected: false, googleCalendarId: null, googleRefreshToken: null,
    stripeAccountId: "acct_test_placeholder", stripePayoutsEnabled: true, stripeDetailsSubmitted: true });
  mocks.collection.mockResolvedValue({ id: "Therapists", plugins: [] });
  mocks.indexes.mockResolvedValue([{ name: "theraplyId_unique", status: "ACTIVE", unique: true, fields: [{ path: "theraplyId" }] }]);
  items = [{ id: itemId, revision: "7", data: { theraplyId: profileId, displayName: "Preserved", bio: "Do not return",
    customField: { keep: true }, isPublished: true, isBookable: true } }];
  mocks.inventory.mockImplementation(async () => structuredClone(items));
  mocks.reconcile.mockImplementation(async () => {
    const changed = items[0].data.isPublished;
    items[0].data.isPublished = false;
    items[0].data.isBookable = false;
    return { status: changed ? "HIDDEN" : "NO_CHANGE", wixItemId: itemId, publicReady: false };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("temporary exact-target Wix Copy runtime endpoint", () => {
  it("GET only serves an authenticated form and never reconciles", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Read-only preflight");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires a fresh active ADMIN role", async () => {
    mocks.role.mockRejectedValue(new ActionPermissionError());
    expect((await POST(request())).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { origin: "https://platform.theraply.online" }, { origin: "null" }, { origin: "" },
    { "sec-fetch-site": "cross-site" }, { purpose: "prefetch" }, { "sec-purpose": "prerender" }, { "next-router-prefetch": "1" },
  ])("rejects foreign origins or speculative requests: %j", async headers => {
    expect((await POST(request("mode=preflight", headers))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects forged request URL even with a staging Origin", async () => {
    const req = new NextRequest("https://platform.theraply.online/api/admin/wix02a", {
      method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "mode=preflight",
    });
    expect((await POST(req)).status).toBe(403);
  });
  it.each(["mode=execute", "mode=preflight&profileId=other", "mode=preflight&wixItemId=other", "mode=preflight&mode=execute", "mode=unknown"])("rejects arbitrary or incomplete operation input: %s", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it.each([
    ["VERCEL", ""], ["VERCEL_PROJECT_ID", "other"], ["VERCEL_GIT_COMMIT_REF", "main"], ["VERCEL_ENV", "preview"],
    ["VERCEL_GIT_COMMIT_SHA", ""], ["APP_URL", "https://platform.theraply.online"],
    ["WIX_CMS_ENVIRONMENT", "production"], ["WIX_CMS_SITE_ID", "1ce946b1-1bcb-4b89-a1b5-86358d639333"],
    ["DATABASE_URL", "postgresql://placeholder:placeholder@localhost/theraply_db"],
    ["DATABASE_URL", "postgresql://placeholder:placeholder@staging.prisma.io/postgres?schema=other"],
    ["WIX_STAGING_ISOLATED_PROFILE_ID", profileId], ["WIX_CMS_AUTOMATION_ENABLED", "true"],
  ])("fails closed outside verified staging: %s", async (key, value) => {
    vi.stubEnv(key, value);
    expect(() => assertWix02aRuntime()).toThrow();
    expect((await GET()).status).toBe(403);
    expect((await POST(request())).status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("checks actual database identity before provider access", async () => {
    mocks.query.mockResolvedValue([{ database: "theraply_db", schema: "public", readonly: "on" }]);
    await expect(runWix02a("preflight")).rejects.toMatchObject({ code: "DATABASE_IDENTITY_BLOCKED", writeAttempted: false });
    expect(mocks.inventory).not.toHaveBeenCalled();
  });
  it("rejects changed ownership or canonical readiness", async () => {
    const original = await mocks.profile();
    mocks.profile.mockResolvedValue({ ...original, user: { ...original.user, id: "other-user" } });
    await expect(runWix02a("preflight")).rejects.toMatchObject({ code: "PROFILE_OWNERSHIP_BLOCKED" });
    mocks.profile.mockResolvedValue({ ...original, isGoogleCalendarConnected: true, googleCalendarId: "calendar", googleRefreshToken: "test-placeholder" });
    await expect(runWix02a("preflight")).rejects.toMatchObject({ code: "READINESS_CHANGED" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it.each(["missing", "foreign-item", "foreign-profile", "duplicate", "mixed-flags"])("rejects unsafe item state: %s", async state => {
    if (state === "missing") items = [];
    if (state === "foreign-item") items[0].id = "other";
    if (state === "foreign-profile") items[0].data.theraplyId = "other";
    if (state === "duplicate") items.push(structuredClone(items[0]));
    if (state === "mixed-flags") items[0].data.isBookable = false;
    await expect(runWix02a("preflight")).rejects.toBeDefined();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("preflight returns safe evidence but no profile content or tokens", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("PREFLIGHT_PASSED");
    expect(body).not.toMatch(/Do not return|test-placeholder-token|acct_test_placeholder/);
    expect(mocks.executeRaw.mock.calls[0][0][0]).toBe("SET TRANSACTION READ ONLY");
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("invokes only the pinned canonical depublish operation and preserves data", async () => {
    const baseline = await runWix02a("preflight");
    const body = `mode=execute&confirmation=WIX02A_HIDE_ONE_COPY_ITEM&snapshot=${baseline.snapshot}`;
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("HIDDEN");
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(profileId, { expectedWixItemId: itemId });
    expect(items[0].data.customField).toEqual({ keep: true });
    expect((await POST(request(body))).status).toBe(409);
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });
  it("already hidden state produces NO_CHANGE through the canonical service", async () => {
    items[0].data.isPublished = false; items[0].data.isBookable = false;
    const baseline = await runWix02a("preflight");
    await expect(runWix02a("execute", baseline.snapshot)).resolves.toMatchObject({ result: "NO_CHANGE", databaseUnchanged: true });
  });
  it("rejects stale preflight and concurrent execution before canonical call", async () => {
    const baseline = await runWix02a("preflight");
    items[0].data.displayName = "Changed externally";
    await expect(runWix02a("execute", baseline.snapshot)).rejects.toMatchObject({ code: "PREFLIGHT_SNAPSHOT_CHANGED" });
    mocks.query.mockResolvedValue([{ acquired: false }]);
    await expect(runWix02a("execute", baseline.snapshot)).rejects.toMatchObject({ code: "OPERATION_ALREADY_IN_PROGRESS" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("does not retry ambiguous writes or expose provider errors", async () => {
    const baseline = await runWix02a("preflight");
    mocks.reconcile.mockRejectedValue(new Error("private-provider-response"));
    await expect(runWix02a("execute", baseline.snapshot)).rejects.toMatchObject({
      code: "AMBIGUOUS_EXECUTION_READ_STATE_BEFORE_RETRY", writeAttempted: true,
    });
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });
  it("detects post-write custom data or database changes", async () => {
    const baseline = await runWix02a("preflight");
    mocks.reconcile.mockImplementation(async () => {
      items[0].data.isPublished = false; items[0].data.isBookable = false;
      items[0].data.customField = "unexpected";
      return { status: "HIDDEN", wixItemId: itemId, publicReady: false };
    });
    await expect(runWix02a("execute", baseline.snapshot)).rejects.toMatchObject({ code: "CMS_READBACK_MISMATCH", writeAttempted: true });
  });
  it("detects changed database fingerprints after reconciliation", async () => {
    const baseline = await runWix02a("preflight");
    let reads = 0;
    mocks.hashes.mockImplementation(async () => [{ count: "1", fingerprint: ++reads <= 7 ? "unchanged" : "changed" }]);
    await expect(runWix02a("execute", baseline.snapshot)).rejects.toMatchObject({ code: "DATABASE_FINGERPRINT_CHANGED", writeAttempted: true });
  });
  it("rejects draft workflows and missing unique indexes", async () => {
    mocks.collection.mockResolvedValueOnce({ id: "Therapists", plugins: [{ type: "DRAFT" }] });
    await expect(runWix02a("preflight")).rejects.toMatchObject({ code: "COLLECTION_BLOCKED" });
    mocks.indexes.mockResolvedValueOnce([]);
    await expect(runWix02a("preflight")).rejects.toMatchObject({ code: "UNIQUE_INDEX_BLOCKED" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
