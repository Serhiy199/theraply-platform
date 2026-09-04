import "server-only";
import { evaluateTherapistReadiness } from "@/lib/therapist-readiness";
import { getCanonicalAppBaseUrl } from "@/lib/urls/canonical-app-url";
import {
  getWixCmsTherapistsCollection,
  listAllWixCmsTherapists,
  listWixCmsTherapistIndexes,
  type WixCmsDataItem,
} from "@/lib/wix/wix-cms-client";
import {
  getWixCmsConfig,
  type WixCmsTokenSource,
  WIX_THERAPLY_ID_UNIQUE_INDEX_NAME,
  WIX_THERAPISTS_COLLECTION_ID,
} from "@/lib/wix/wix-cms-config";
import { prisma } from "@/lib/prisma";
import {
  mapTherapistToWixCmsItem,
  reconcileTherapistPublicProfile,
  wixCmsTherapistProfileSelect,
  type WixCmsTherapistProfile,
} from "@/server/services/wix-cms-therapist-sync.service";

export const WIX_PRODUCTION_RECONCILIATION_CONFIRMATION =
  "WIX_PRODUCTION_RECONCILE";
export const WIX_PRODUCTION_APP_ORIGIN = "https://platform.theraply.online";

const REQUIRED_COLLECTION_FIELDS: Record<string, readonly string[]> = {
  theraplyId: ["TEXT"],
  displayName: ["TEXT"],
  bio: ["RICH_TEXT", "TEXT"],
  specialization: ["TEXT"],
  therapyServicesProvided: ["TEXT"],
  yearsOfExperience: ["TEXT"],
  profilePhoto: ["IMAGE"],
  sessionPricePence: ["NUMBER"],
  sessionPriceDisplay: ["TEXT"],
  bookingUrl: ["URL"],
  isBookable: ["BOOLEAN"],
  isPublished: ["BOOLEAN"],
};

export type WixProductionReconciliationAction =
  | "CREATE"
  | "UPDATE"
  | "NO_CHANGE"
  | "HIDDEN"
  | "SKIP";

export type WixProductionReconciliationOptions = {
  write?: boolean;
  expectedCount?: number;
  allowProfileIds?: string[];
  confirmation?: string;
};

export type WixProductionReconciliationPlan = {
  therapistProfileId: string;
  action: WixProductionReconciliationAction;
  wixItemId: string | null;
};

export type WixProductionReconciliationReport = {
  mode: "DRY_RUN" | "WRITE";
  environment: "production";
  cmsTokenSource: WixCmsTokenSource;
  collectionId: typeof WIX_THERAPISTS_COLLECTION_ID;
  eligibleCount: number;
  eligibleProfileIds: string[];
  wixItemCount: number;
  plans: WixProductionReconciliationPlan[];
  results: Array<{
    therapistProfileId: string;
    action: WixProductionReconciliationAction;
    wixItemId: string | null;
  }>;
};

export class WixProductionReconciliationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PRODUCTION_ENVIRONMENT_REQUIRED"
      | "PRODUCTION_URL_REQUIRED"
      | "COLLECTION_SCHEMA_MISMATCH"
      | "UNIQUE_INDEX_REQUIRED"
      | "INVALID_WIX_IDENTITY"
      | "DUPLICATE_WIX_IDENTITY"
      | "EXPECTED_COUNT_MISMATCH"
      | "PRODUCTION_CONFIRMATION_REQUIRED"
      | "ALLOWLIST_MISMATCH",
  ) {
    super(message);
    this.name = "WixProductionReconciliationError";
  }
}

function normalizedUniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function itemMatches(item: WixCmsDataItem, expected: Record<string, unknown>) {
  return Object.entries(expected).every(([key, value]) => item.data[key] === value);
}

function assertProductionUrl() {
  const baseUrl = getCanonicalAppBaseUrl();

  if (baseUrl.protocol !== "https:" || baseUrl.origin !== WIX_PRODUCTION_APP_ORIGIN) {
    throw new WixProductionReconciliationError(
      "The canonical app URL must be the HTTPS Theraply production origin.",
      "PRODUCTION_URL_REQUIRED",
    );
  }
}

function assertCollectionSchema(fields: Array<{ key: string; type: string }>) {
  const actual = new Map(fields.map((field) => [field.key, field.type]));
  const mismatches = Object.entries(REQUIRED_COLLECTION_FIELDS).filter(
    ([key, acceptedTypes]) => !acceptedTypes.includes(actual.get(key) ?? ""),
  );

  if (mismatches.length) {
    throw new WixProductionReconciliationError(
      `The Therapists collection schema is incompatible: ${mismatches
        .map(([key]) => key)
        .join(", ")}.`,
      "COLLECTION_SCHEMA_MISMATCH",
    );
  }
}

function indexItemsByTheraplyId(items: WixCmsDataItem[]) {
  const indexed = new Map<string, WixCmsDataItem>();

  for (const item of items) {
    const theraplyId =
      typeof item.data.theraplyId === "string" ? item.data.theraplyId.trim() : "";

    if (!theraplyId) {
      throw new WixProductionReconciliationError(
        "A Wix therapist item is missing its canonical Theraply identity.",
        "INVALID_WIX_IDENTITY",
      );
    }

    if (indexed.has(theraplyId)) {
      throw new WixProductionReconciliationError(
        "Duplicate Wix therapist identities were found.",
        "DUPLICATE_WIX_IDENTITY",
      );
    }

    indexed.set(theraplyId, item);
  }

  return indexed;
}

function buildPlans(
  profiles: WixCmsTherapistProfile[],
  wixItemsByTheraplyId: Map<string, WixCmsDataItem>,
) {
  return profiles.map((profile): WixProductionReconciliationPlan => {
    const existingItem = wixItemsByTheraplyId.get(profile.id);

    if (!existingItem) {
      return { therapistProfileId: profile.id, action: "CREATE", wixItemId: null };
    }

    const projection = mapTherapistToWixCmsItem(profile);
    return {
      therapistProfileId: profile.id,
      action: itemMatches(existingItem, projection) ? "NO_CHANGE" : "UPDATE",
      wixItemId: existingItem.id,
    };
  });
}

function normalizeSyncAction(
  status: "CREATED" | "UPDATED" | "HIDDEN" | "SKIPPED_NOT_PUBLIC_READY" | "NO_CHANGE",
): WixProductionReconciliationAction {
  if (status === "CREATED") return "CREATE";
  if (status === "UPDATED") return "UPDATE";
  if (status === "SKIPPED_NOT_PUBLIC_READY") return "SKIP";
  return status;
}

export async function runWixCmsProductionReconciliation(
  options: WixProductionReconciliationOptions = {},
): Promise<WixProductionReconciliationReport> {
  const config = getWixCmsConfig();

  if (config.environment !== "production") {
    throw new WixProductionReconciliationError(
      "Production reconciliation requires WIX_CMS_ENVIRONMENT=production.",
      "PRODUCTION_ENVIRONMENT_REQUIRED",
    );
  }

  assertProductionUrl();

  const [collection, indexes, wixItems, profiles] = await Promise.all([
    getWixCmsTherapistsCollection(),
    listWixCmsTherapistIndexes(),
    listAllWixCmsTherapists(),
    prisma.therapistProfile.findMany({
      select: wixCmsTherapistProfileSelect,
      orderBy: { id: "asc" },
    }),
  ]);

  if (collection.id !== WIX_THERAPISTS_COLLECTION_ID) {
    throw new WixProductionReconciliationError(
      "The canonical Therapists collection was not returned.",
      "COLLECTION_SCHEMA_MISMATCH",
    );
  }
  assertCollectionSchema(collection.fields);

  const uniqueIndexReady = indexes.some(
    (index) =>
      index.name === WIX_THERAPLY_ID_UNIQUE_INDEX_NAME &&
      index.status === "ACTIVE" &&
      index.unique &&
      index.fields.length === 1 &&
      index.fields[0]?.path === "theraplyId",
  );
  if (!uniqueIndexReady) {
    throw new WixProductionReconciliationError(
      "The active unique theraplyId index is required.",
      "UNIQUE_INDEX_REQUIRED",
    );
  }

  const wixItemsByTheraplyId = indexItemsByTheraplyId(wixItems);
  const eligibleProfiles = profiles.filter(
    (profile) =>
      evaluateTherapistReadiness({ user: profile.user, profile }).publicReady,
  );
  const eligibleProfileIds = eligibleProfiles.map((profile) => profile.id).sort();

  if (
    options.expectedCount !== undefined &&
    options.expectedCount !== eligibleProfileIds.length
  ) {
    throw new WixProductionReconciliationError(
      "The eligible therapist count does not match the confirmed expected count.",
      "EXPECTED_COUNT_MISMATCH",
    );
  }

  const plans = buildPlans(eligibleProfiles, wixItemsByTheraplyId);
  const report: WixProductionReconciliationReport = {
    mode: options.write ? "WRITE" : "DRY_RUN",
    environment: "production",
    cmsTokenSource: config.tokenSource,
    collectionId: WIX_THERAPISTS_COLLECTION_ID,
    eligibleCount: eligibleProfileIds.length,
    eligibleProfileIds,
    wixItemCount: wixItems.length,
    plans,
    results: [],
  };

  if (!options.write) return report;

  if (
    options.confirmation !== WIX_PRODUCTION_RECONCILIATION_CONFIRMATION
  ) {
    throw new WixProductionReconciliationError(
      "Explicit production confirmation is required.",
      "PRODUCTION_CONFIRMATION_REQUIRED",
    );
  }

  if (options.expectedCount === undefined) {
    throw new WixProductionReconciliationError(
      "Write mode requires an exact confirmed expected count.",
      "EXPECTED_COUNT_MISMATCH",
    );
  }

  const allowProfileIds = normalizedUniqueIds(options.allowProfileIds ?? []);
  if (!allowProfileIds.length || !sameIds(allowProfileIds, eligibleProfileIds)) {
    throw new WixProductionReconciliationError(
      "The write allowlist must exactly match the canonical eligible profile set.",
      "ALLOWLIST_MISMATCH",
    );
  }

  for (const therapistProfileId of allowProfileIds) {
    const result = await reconcileTherapistPublicProfile(therapistProfileId);
    report.results.push({
      therapistProfileId,
      action: normalizeSyncAction(result.status),
      wixItemId: result.wixItemId,
    });
  }

  return report;
}
