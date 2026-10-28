import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateTherapistReadiness } from "@/lib/therapist-readiness";
import { getWixCmsConfig } from "@/lib/wix/wix-cms-config";
import { assertWixProfileNotIsolated, getWixProfileIsolationState } from "@/lib/wix/wix-staging-isolation";
import { getWixCmsTherapistsCollection, listAllWixCmsTherapists, listWixCmsTherapistIndexes, type WixCmsDataItem } from "@/lib/wix/wix-cms-client";
import { reconcileTherapistPublicProfile, wixCmsTherapistProfileSelect } from "@/server/services/wix-cms-therapist-sync.service";

const PROFILE_ID = "cmqmkg8sq0008ky04m764ti7d";
const USER_ID = "cmqmkg8nh0006ky04qmn87vau";
const ITEM_ID = "d65eb481-cb1e-446a-a6b2-7ec91405b873";
const ISOLATED_PROFILE_ID = "cmvgohrvy0002jm0849lxxax0";
const SITE_ID = "80d72d55-7ad6-4efd-8091-c82ec66fb286";
export const WIX02A_ORIGIN = "https://theraply-platform.vercel.app";

export class Wix02aBlocked extends Error {
  constructor(public readonly code: string, public readonly writeAttempted = false) {
    super(code);
  }
}

function requireCheck(passed: unknown, code: string): asserts passed {
  if (!passed) throw new Wix02aBlocked(code);
}

export function assertWix02aRuntime() {
  requireCheck(process.env.VERCEL === "1" &&
    process.env.VERCEL_PROJECT_ID === "prj_V23l6neyJoyjb46Lc5zXsEGGNMDU" &&
    process.env.VERCEL_GIT_COMMIT_REF === "develop" &&
    process.env.VERCEL_ENV === "production" &&
    /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? ""), "RUNTIME_IDENTITY_BLOCKED");
  requireCheck(process.env.WIX_CMS_AUTOMATION_ENABLED !== "true", "AUTOMATION_MUST_STAY_DISABLED");
  const config = getWixCmsConfig();
  requireCheck(config.environment === "staging" && config.siteId === SITE_ID &&
    config.tokenSource === "WIX_CMS_API_TOKEN", "COPY_CONFIG_BLOCKED");
  requireCheck(process.env.WIX_STAGING_ISOLATED_PROFILE_ID === ISOLATED_PROFILE_ID &&
    getWixProfileIsolationState(ISOLATED_PROFILE_ID).status === "ISOLATED", "PROTECTED_PROFILE_GUARD_BLOCKED");
  assertWixProfileNotIsolated(PROFILE_ID);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

async function databaseFingerprints(tx: Prisma.TransactionClient) {
  const result: Record<string, { count: string; fingerprint: string }> = {};
  // Only fixed table names; hashes are computed in Postgres without returning row contents.
  for (const table of ["User", "TherapistProfile", "Booking", "Payment", "Session", "StripeWebhookEvent", "AuditLog"]) {
    const [row] = await tx.$queryRaw<Array<{ count: string; fingerprint: string }>>(Prisma.sql`
      SELECT count(*)::text AS count, md5(coalesce(string_agg(h, '' ORDER BY h), '')) AS fingerprint
      FROM (SELECT md5(row_to_json(t)::text) AS h FROM ${Prisma.raw(`public."${table}"`)} t) hashed
    `);
    result[table] = row;
  }
  return result;
}

function targetItem(items: WixCmsDataItem[]) {
  const matches = items.filter(item => item.data.theraplyId === PROFILE_ID);
  requireCheck(items.length === 1 && matches.length === 1 && matches[0].id === ITEM_ID, "EXACT_ITEM_IDENTITY_BLOCKED");
  const item = matches[0];
  requireCheck((item.data.isPublished === true && item.data.isBookable === true) ||
    (item.data.isPublished === false && item.data.isBookable === false), "FLAGS_BLOCKED");
  return item;
}

function withoutFlags(item: WixCmsDataItem) {
  const { isPublished: _published, isBookable: _bookable, ...data } = item.data;
  void _published;
  void _bookable;
  return data;
}

export async function runWix02a(mode: "preflight" | "execute", expectedSnapshot?: string) {
  assertWix02aRuntime();
  let writeAttempted = false;
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      if (mode === "execute") {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext('wix02a'), hashtext(${PROFILE_ID})) AS acquired`;
        requireCheck(lock.acquired, "OPERATION_ALREADY_IN_PROGRESS");
      }
      const [identity] = await tx.$queryRaw<Array<{ database: string; schema: string; readonly: string }>>`
        SELECT current_database() AS database, current_schema() AS schema,
        current_setting('transaction_read_only') AS readonly`;
      requireCheck(identity.database === "postgres" && identity.schema === "public" && identity.readonly === "on", "DATABASE_IDENTITY_BLOCKED");
      const profile = await tx.therapistProfile.findUnique({ where: { id: PROFILE_ID }, select: wixCmsTherapistProfileSelect });
      requireCheck(profile?.id === PROFILE_ID && profile.user.id === USER_ID, "PROFILE_OWNERSHIP_BLOCKED");
      const readiness = evaluateTherapistReadiness({ user: profile.user, profile });
      requireCheck(!readiness.publicReady && readiness.reasons.length === 1 && readiness.reasons[0] === "CALENDAR_NOT_READY", "READINESS_CHANGED");
      const collection = await getWixCmsTherapistsCollection();
      requireCheck(collection.id === "Therapists" && !collection.plugins?.some(plugin => JSON.stringify(plugin).toLowerCase().includes("draft")), "COLLECTION_BLOCKED");
      const indexes = await listWixCmsTherapistIndexes();
      requireCheck(indexes.some(index => index.name === "theraplyId_unique" && index.unique && index.status === "ACTIVE" &&
        index.fields.length === 1 && index.fields[0].path === "theraplyId"), "UNIQUE_INDEX_BLOCKED");
      const beforeItems = await listAllWixCmsTherapists();
      const before = targetItem(beforeItems);
      const beforeDb = await databaseFingerprints(tx);
      const snapshot = fingerprint({ items: beforeItems, database: beforeDb, sha: process.env.VERCEL_GIT_COMMIT_SHA });
      const report = {
        runtime: "VERIFIED_STAGING_VERCEL", sha: process.env.VERCEL_GIT_COMMIT_SHA,
        appUrlMatch: true, database: "postgres/public", databaseReadOnly: true,
        siteId: SITE_ID, profileId: PROFILE_ID, wixItemId: ITEM_ID,
        protectedProfileIsolated: true, publicReady: false, blockers: readiness.reasons,
        itemCount: beforeItems.length, revision: before.revision ?? null,
        flags: { isPublished: before.data.isPublished, isBookable: before.data.isBookable },
        snapshot, databaseFingerprints: beforeDb,
      };
      if (mode === "preflight") return { ...report, mode, result: "PREFLIGHT_PASSED", writeAttempted: false };
      requireCheck(expectedSnapshot === snapshot, "PREFLIGHT_SNAPSHOT_CHANGED");
      // The only writer is the existing depublish-only canonical service. No retry here.
      writeAttempted = true;
      const result = await reconcileTherapistPublicProfile(PROFILE_ID, { expectedWixItemId: ITEM_ID });
      requireCheck(["HIDDEN", "NO_CHANGE"].includes(result.status) && result.wixItemId === ITEM_ID && !result.publicReady, "UNEXPECTED_CANONICAL_RESULT");
      const afterItems = await listAllWixCmsTherapists();
      const after = targetItem(afterItems);
      requireCheck(after.data.isPublished === false && after.data.isBookable === false &&
        fingerprint(withoutFlags(before)) === fingerprint(withoutFlags(after)), "CMS_READBACK_MISMATCH");
      const afterDb = await databaseFingerprints(tx);
      requireCheck(fingerprint(beforeDb) === fingerprint(afterDb), "DATABASE_FINGERPRINT_CHANGED");
      return { ...report, mode, previousFlags: report.flags, flags: { isPublished: false, isBookable: false },
        result: result.status, writeAttempted, otherFieldsUnchanged: true, itemCountUnchanged: true,
        noDuplicates: true, databaseUnchanged: true, otherItemsChanged: 0 };
    }, { timeout: 80_000, maxWait: 5_000 });
  } catch (error) {
    if (error instanceof Wix02aBlocked) throw new Wix02aBlocked(error.code, writeAttempted);
    throw new Wix02aBlocked(writeAttempted ? "AMBIGUOUS_EXECUTION_READ_STATE_BEFORE_RETRY" : "PREFLIGHT_FAILED", writeAttempted);
  }
}
