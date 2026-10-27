import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCanonicalAppBaseUrl } from "@/lib/urls/canonical-app-url";
import { getWixCmsConfig, WIX_THERAPLY_ID_UNIQUE_INDEX_NAME } from "@/lib/wix/wix-cms-config";
import { getWixProfileIsolationState } from "@/lib/wix/wix-staging-isolation";
import { getWixCmsTherapistsCollection, listWixCmsTherapistIndexes } from "@/lib/wix/wix-cms-client";
import { WIX_CMS_REQUIRED_FIELDS } from "@/lib/wix/wix-cms-schema";
import { createAuditLogEntry, createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";
import { reconcileTherapistPublicProfile } from "@/server/services/wix-cms-therapist-sync.service";

export function assertWixCmsAutomationEnvironment() {
  const config = getWixCmsConfig();
  const base = getCanonicalAppBaseUrl();
  if (base.pathname !== "/" || base.search || base.hash || base.username || base.password) {
    throw new Error("WIX_CMS_AUTOMATION_URL_BLOCKED");
  }
  const origin = base.origin;
  const database = new URL(process.env.DATABASE_URL ?? "");
  const staging = config.environment === "staging" && origin === "https://theraply-platform.vercel.app" &&
    getWixProfileIsolationState("automation-preflight").status === "NORMAL";
  const production = config.environment === "production" && origin === "https://platform.theraply.online" &&
    !process.env.VERCEL && ["localhost", "127.0.0.1"].includes(database.hostname) &&
    database.pathname === "/theraply_db" && (database.searchParams.get("schema") ?? "public") === "public";
  if (!staging && !production) throw new Error("WIX_CMS_AUTOMATION_ENVIRONMENT_BLOCKED");
}

async function preflight() {
  assertWixCmsAutomationEnvironment();
  const [collection, indexes] = await Promise.all([getWixCmsTherapistsCollection(), listWixCmsTherapistIndexes()]);
  // This integration uses plain live items, not a separate draft/publish workflow.
  if (collection.plugins?.some(plugin => JSON.stringify(plugin).toLowerCase().includes("draft"))) {
    throw new Error("WIX_CMS_AUTOMATION_DRAFT_WORKFLOW_UNSUPPORTED");
  }
  const fields = new Map(collection.fields.map(field => [field.key, field.type]));
  if (collection.id !== "Therapists" || Object.entries(WIX_CMS_REQUIRED_FIELDS).some(([key, types]) => !types.includes(fields.get(key) ?? ""))) {
    throw new Error("WIX_CMS_AUTOMATION_SCHEMA_BLOCKED");
  }
  if (!indexes.some(index => index.name === WIX_THERAPLY_ID_UNIQUE_INDEX_NAME && index.unique &&
    index.status === "ACTIVE" && index.fields.length === 1 && index.fields[0]?.path === "theraplyId")) {
    throw new Error("WIX_CMS_AUTOMATION_UNIQUE_INDEX_REQUIRED");
  }
}

async function reconcileObserved(profileId: string) {
  const isolation = getWixProfileIsolationState(profileId);
  if (isolation.status === "ISOLATED") return "ISOLATED";
  try {
    const result = await reconcileTherapistPublicProfile(profileId);
    await createAuditLogEntryBestEffort({
      entityType: "TherapistProfile", entityId: profileId, action: "WIX_CMS_RECONCILED",
      after: { status: result.status, wixItemId: result.wixItemId, publicReady: result.publicReady },
    });
    return result.status;
  } catch {
    // Do not record provider payloads, profile content or credentials.
    logDiagnosticEvent("wix-cms-automation", "Reconciliation failed; the backstop will retry.", { therapistProfileId: profileId });
    await createAuditLogEntryBestEffort({ entityType: "TherapistProfile", entityId: profileId,
      action: "WIX_CMS_RECONCILIATION_FAILED", after: { retry: "NEXT_BACKSTOP" } });
    return "FAILED";
  }
}

// Call only after a canonical mutation has committed, never from render or prefetch.
export function scheduleWixCmsReconciliation(profileId: string) {
  if (process.env.WIX_CMS_AUTOMATION_ENABLED !== "true") return;
  try {
    assertWixCmsAutomationEnvironment();
    if (getWixProfileIsolationState(profileId).status === "ISOLATED") return;
    after(async () => {
      try {
        await preflight();
        await reconcileObserved(profileId);
      } catch {
        logDiagnosticEvent("wix-cms-automation", "Deferred sync blocked; inspect configuration and retry via backstop.", { therapistProfileId: profileId });
      }
    });
  } catch {
    logDiagnosticEvent("wix-cms-automation", "Unable to schedule deferred sync; backstop required.", { therapistProfileId: profileId });
  }
}

export async function runWixCmsAutomationBackstop() {
  if (process.env.WIX_CMS_AUTOMATION_ENABLED !== "true") return { status: "DISABLED" as const };
  await preflight();
  const previous = await prisma.auditLog.findFirst({
    where: { action: "WIX_CMS_BACKSTOP_RUN", entityId: "Therapists" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { after: true },
  });
  const metadata = previous?.after;
  const cursor = metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
    typeof metadata.nextCursor === "string" ? metadata.nextCursor : null;
  const profiles = await prisma.therapistProfile.findMany({
    where: cursor ? { id: { gt: cursor } } : {}, orderBy: { id: "asc" }, take: 51, select: { id: true },
  });
  const started = Date.now();
  const results: Array<{ profileId: string; status: string }> = [];
  for (const profile of profiles.slice(0, 50)) {
    if (Date.now() - started > 180_000) break;
    results.push({ profileId: profile.id, status: await reconcileObserved(profile.id) });
  }
  const partial = results.length < profiles.length;
  const nextCursor = partial ? results.at(-1)?.profileId ?? cursor : null;
  const report = { status: results.some(result => result.status === "FAILED") ? "RETRY_REQUIRED" : partial ? "PARTIAL" : "COMPLETED",
    nextCursor, results };
  await createAuditLogEntry({ entityType: "WixCms", entityId: "Therapists", action: "WIX_CMS_BACKSTOP_RUN", after: report });
  return report;
}
