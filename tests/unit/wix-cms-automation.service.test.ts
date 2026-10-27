import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableWixStagingIsolation, ISOLATED_PROFILE_ID } from "../helpers/wix-staging-isolation";
import { WIX_CMS_REQUIRED_FIELDS } from "@/lib/wix/wix-cms-schema";

const mocks = vi.hoisted(() => ({ after: vi.fn(), reconcile: vi.fn(), collection: vi.fn(), indexes: vi.fn(),
  profiles: vi.fn(), previous: vi.fn(), audit: vi.fn(), diagnostic: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/prisma", () => ({ prisma: { therapistProfile: { findMany: mocks.profiles }, auditLog: { findFirst: mocks.previous } } }));
vi.mock("@/server/services/wix-cms-therapist-sync.service", () => ({ reconcileTherapistPublicProfile: mocks.reconcile }));
vi.mock("@/server/services/audit-log.service", () => ({ createAuditLogEntry: mocks.audit, createAuditLogEntryBestEffort: mocks.audit, logDiagnosticEvent: mocks.diagnostic }));
vi.mock("@/lib/wix/wix-cms-client", () => ({ getWixCmsTherapistsCollection: mocks.collection, listWixCmsTherapistIndexes: mocks.indexes }));
import { runWixCmsAutomationBackstop, scheduleWixCmsReconciliation } from "@/server/services/wix-cms-automation.service";

beforeEach(() => {
  vi.resetAllMocks();
  enableWixStagingIsolation(ISOLATED_PROFILE_ID);
  vi.stubEnv("WIX_CMS_API_TOKEN", "mock-only");
  vi.stubEnv("WIX_CMS_SITE_ID", "80d72d55-7ad6-4efd-8091-c82ec66fb286");
  vi.stubEnv("WIX_CMS_AUTOMATION_ENABLED", "true");
  mocks.collection.mockResolvedValue({ id: "Therapists", fields: Object.entries(WIX_CMS_REQUIRED_FIELDS).map(([key, types]) => ({ key, type: types[0] })) });
  mocks.indexes.mockResolvedValue([{ name: "theraplyId_unique", status: "ACTIVE", unique: true, fields: [{ path: "theraplyId" }] }]);
  mocks.previous.mockResolvedValue(null);
  mocks.profiles.mockResolvedValue([{ id: "normal-profile" }]);
  mocks.reconcile.mockResolvedValue({ status: "NO_CHANGE", wixItemId: "item", publicReady: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("CMS automatic synchronization safety and backstop", () => {
  it("is opt-in: disabled does not register callbacks, read DB or call Wix", async () => {
    vi.stubEnv("WIX_CMS_AUTOMATION_ENABLED", "");
    scheduleWixCmsReconciliation("profile");
    expect(await runWixCmsAutomationBackstop()).toEqual({ status: "DISABLED" });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it("defers external work until after the committed action returns", async () => {
    scheduleWixCmsReconciliation("normal-profile");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.reconcile).toHaveBeenCalledWith("normal-profile");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "WIX_CMS_RECONCILED" }));
  });
  it("preserves fixture isolation without any CMS calls", () => {
    scheduleWixCmsReconciliation(ISOLATED_PROFILE_ID);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it.each(["APP_URL", "DATABASE_URL", "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "WIX_CMS_SITE_ID"])("fails closed for mismatched %s", async key => {
    vi.stubEnv(key, "mismatch");
    scheduleWixCmsReconciliation("normal-profile");
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("does not fail a committed user action when after registration is unavailable", () => {
    mocks.after.mockImplementation(() => { throw new Error("no request scope"); });
    expect(() => scheduleWixCmsReconciliation("profile")).not.toThrow();
    expect(mocks.diagnostic).toHaveBeenCalled();
  });
  it("requires an ACTIVE exact unique index before automatic mutations", async () => {
    mocks.indexes.mockResolvedValue([]);
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow("UNIQUE_INDEX_REQUIRED");
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("blocks incompatible schema and draft collections", async () => {
    mocks.collection.mockResolvedValue({ id: "Therapists", fields: [], plugins: [{ type: "DRAFT_ITEMS" }] });
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow("DRAFT_WORKFLOW");
    mocks.collection.mockResolvedValue({ id: "Therapists", fields: [] });
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow("SCHEMA_BLOCKED");
  });
  it("scans inactive/non-public profiles too, skips isolated fixture, and retries failures next sweep", async () => {
    mocks.profiles.mockResolvedValue([{ id: ISOLATED_PROFILE_ID }, { id: "inactive" }, { id: "ready" }]);
    mocks.reconcile.mockRejectedValueOnce(new Error("provider secret must not be logged")).mockResolvedValue({ status: "HIDDEN", wixItemId: "item", publicReady: false });
    const first = await runWixCmsAutomationBackstop();
    expect(first.status).toBe("RETRY_REQUIRED");
    expect(mocks.reconcile.mock.calls.map(call => call[0])).toEqual(["inactive", "ready"]);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("provider secret");
    const retry = await runWixCmsAutomationBackstop();
    expect(retry.status).toBe("COMPLETED");
  });
  it("resumes bounded sweeps from the durable audit cursor", async () => {
    mocks.previous.mockResolvedValue({ after: { nextCursor: "last-profile" } });
    await runWixCmsAutomationBackstop();
    expect(mocks.profiles).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { gt: "last-profile" } } }));
  });
  it("reports a bounded page as partial and persists its exact continuation", async () => {
    mocks.profiles.mockResolvedValue(Array.from({ length: 51 }, (_, n) => ({ id: `profile-${n}` })));
    expect(await runWixCmsAutomationBackstop()).toMatchObject({ status: "PARTIAL", nextCursor: "profile-49" });
    expect(mocks.reconcile).toHaveBeenCalledTimes(50);
  });
  it("does not report cron success when the continuation cannot be persisted", async () => {
    mocks.profiles.mockResolvedValue([]);
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow("audit unavailable");
  });
  it("permits production only with its own explicit configuration and local DB", async () => {
    vi.stubEnv("WIX_CMS_ENVIRONMENT", "production");
    vi.stubEnv("WIX_CMS_SITE_ID", "1ce946b1-1bcb-4b89-a1b5-86358d639333");
    vi.stubEnv("WIX_CMS_API_TOKEN_PRODUCTION", "mock-only");
    vi.stubEnv("APP_URL", "https://platform.theraply.online");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_PROJECT_ID", "");
    vi.stubEnv("DATABASE_URL", "postgresql://mock:mock@127.0.0.1:5432/theraply_db?schema=public");
    await expect(runWixCmsAutomationBackstop()).resolves.toMatchObject({ status: "COMPLETED" });
    vi.stubEnv("VERCEL", "1");
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow("ENVIRONMENT_BLOCKED");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("APP_URL", "https://platform.theraply.online/unexpected-path");
    await expect(runWixCmsAutomationBackstop()).rejects.toThrow("URL_BLOCKED");
  });
});
