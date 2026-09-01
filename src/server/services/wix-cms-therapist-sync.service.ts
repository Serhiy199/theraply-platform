import "server-only";
import { Prisma } from "@prisma/client";
import { evaluateTherapistReadiness } from "@/lib/therapist-readiness";
import { buildCanonicalAppUrl } from "@/lib/urls/canonical-app-url";
import {
  createWixCmsTherapist,
  findWixCmsTherapistsByTheraplyId,
  type WixCmsDataItem,
  type WixCmsTherapistData,
  updateWixCmsTherapist,
} from "@/lib/wix/wix-cms-client";
import { WixCmsConfigError } from "@/lib/wix/wix-cms-config";
import {
  getWixApiRequestDiagnostic,
  type WixApiRequestDiagnostic,
} from "@/lib/wix/wix-client";
import { prisma } from "@/lib/prisma";
import { logDiagnosticEvent } from "@/server/services/audit-log.service";

const wixCmsTherapistProfileSelect = {
  id: true,
  displayName: true,
  bio: true,
  specialization: true,
  therapyServicesProvided: true,
  yearsOfExperience: true,
  profilePhotoUrl: true,
  sessionPricePence: true,
  approvalStatus: true,
  isApproved: true,
  onboardingCompleted: true,
  isGoogleCalendarConnected: true,
  googleCalendarId: true,
  googleRefreshToken: true,
  stripeAccountId: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  user: {
    select: {
      id: true,
      role: true,
      isActive: true,
      emailVerified: true,
    },
  },
} satisfies Prisma.TherapistProfileSelect;

export type WixCmsTherapistProfile = Prisma.TherapistProfileGetPayload<{
  select: typeof wixCmsTherapistProfileSelect;
}>;

export type WixCmsTherapistSyncResult = {
  status: "CREATED" | "UPDATED" | "HIDDEN" | "SKIPPED_NOT_PUBLIC_READY" | "NO_CHANGE";
  therapistProfileId: string;
  wixItemId: string | null;
  matchCount: number;
  publicReady: boolean;
};

export class WixCmsTherapistSyncError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "WIX_CMS_DUPLICATE_THERAPIST_ID"
      | "WIX_CMS_SYNC_FAILED",
    public readonly diagnostic: WixApiRequestDiagnostic | null = null,
  ) {
    super(message);
    this.name = "WixCmsTherapistSyncError";
  }
}

export function formatWixCmsSessionPrice(sessionPricePence: number) {
  if (!Number.isInteger(sessionPricePence) || sessionPricePence <= 0) {
    throw new WixCmsTherapistSyncError(
      "A positive integer session price is required for Wix CMS projection.",
      "WIX_CMS_SYNC_FAILED",
    );
  }

  const pounds = (sessionPricePence / 100).toFixed(2).replace(/\.00$/, "");
  return `£${pounds}`;
}

function requirePublicText(value: string | null, field: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new WixCmsTherapistSyncError(
      `${field} is required for Wix CMS projection.`,
      "WIX_CMS_SYNC_FAILED",
    );
  }

  return normalized;
}

export function mapTherapistToWixCmsItem(
  profile: WixCmsTherapistProfile,
): WixCmsTherapistData {
  const sessionPricePence = profile.sessionPricePence ?? 0;

  return {
    theraplyId: profile.id,
    displayName: requirePublicText(profile.displayName, "displayName"),
    bio: requirePublicText(profile.bio, "bio"),
    specialization: requirePublicText(profile.specialization, "specialization"),
    therapyServicesProvided: requirePublicText(
      profile.therapyServicesProvided,
      "therapyServicesProvided",
    ),
    yearsOfExperience: requirePublicText(
      profile.yearsOfExperience,
      "yearsOfExperience",
    ),
    profilePhoto: requirePublicText(profile.profilePhotoUrl, "profilePhotoUrl"),
    sessionPricePence,
    sessionPriceDisplay: formatWixCmsSessionPrice(sessionPricePence),
    bookingUrl: buildCanonicalAppUrl(
      `/client/book/${encodeURIComponent(profile.user.id)}`,
    ).toString(),
    isBookable: true,
    isPublished: true,
  };
}

function buildHiddenTherapistData(item: WixCmsDataItem) {
  return {
    ...item.data,
    isBookable: false,
    isPublished: false,
  };
}

function dataMatches(item: WixCmsDataItem, expected: Record<string, unknown>) {
  return Object.entries(expected).every(([key, value]) => item.data[key] === value);
}

function logSyncResult(result: WixCmsTherapistSyncResult) {
  console.info("[wix-cms-therapist-sync] reconciliation completed", {
    therapistProfileId: result.therapistProfileId,
    action: result.status,
    wixItemId: result.wixItemId,
    matchCount: result.matchCount,
    publicReady: result.publicReady,
  });
}

export async function reconcileTherapistPublicProfile(
  therapistProfileId: string,
): Promise<WixCmsTherapistSyncResult> {
  const profile = await prisma.therapistProfile.findUnique({
    where: { id: therapistProfileId },
    select: wixCmsTherapistProfileSelect,
  });

  if (!profile) {
    throw new WixCmsTherapistSyncError(
      "Therapist profile not found.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  const readiness = evaluateTherapistReadiness({
    user: profile.user,
    profile,
  });

  let operation = "QUERY_THERAPIST";

  try {
    const matches = await findWixCmsTherapistsByTheraplyId(profile.id);

    if (matches.length > 1) {
      throw new WixCmsTherapistSyncError(
        "Multiple Wix CMS items share the same Theraply therapist identity.",
        "WIX_CMS_DUPLICATE_THERAPIST_ID",
      );
    }

    if (!readiness.publicReady && matches.length === 0) {
      const result: WixCmsTherapistSyncResult = {
        status: "SKIPPED_NOT_PUBLIC_READY",
        therapistProfileId: profile.id,
        wixItemId: null,
        matchCount: 0,
        publicReady: false,
      };
      logSyncResult(result);
      return result;
    }

    if (!readiness.publicReady) {
      const existingItem = matches[0];
      const hiddenData = buildHiddenTherapistData(existingItem);
      const status = dataMatches(existingItem, hiddenData) ? "NO_CHANGE" : "HIDDEN";
      if (status !== "NO_CHANGE") operation = "UPDATE_THERAPIST";
      const item =
        status === "NO_CHANGE"
          ? existingItem
          : await updateWixCmsTherapist(existingItem, hiddenData);
      const result: WixCmsTherapistSyncResult = {
        status,
        therapistProfileId: profile.id,
        wixItemId: item.id,
        matchCount: 1,
        publicReady: false,
      };
      logSyncResult(result);
      return result;
    }

    const projection = mapTherapistToWixCmsItem(profile);

    if (matches.length === 0) {
      operation = "CREATE_THERAPIST";
      const item = await createWixCmsTherapist(projection);
      const result: WixCmsTherapistSyncResult = {
        status: "CREATED",
        therapistProfileId: profile.id,
        wixItemId: item.id,
        matchCount: 1,
        publicReady: true,
      };
      logSyncResult(result);
      return result;
    }

    const existingItem = matches[0];
    const status = dataMatches(existingItem, projection) ? "NO_CHANGE" : "UPDATED";
    if (status !== "NO_CHANGE") operation = "UPDATE_THERAPIST";
    const item =
      status === "NO_CHANGE"
        ? existingItem
        : await updateWixCmsTherapist(existingItem, projection);
    const result: WixCmsTherapistSyncResult = {
      status,
      therapistProfileId: profile.id,
      wixItemId: item.id,
      matchCount: 1,
      publicReady: true,
    };
    logSyncResult(result);
    return result;
  } catch (error) {
    if (
      error instanceof WixCmsTherapistSyncError ||
      error instanceof WixCmsConfigError
    ) {
      throw error;
    }

    const diagnostic = getWixApiRequestDiagnostic(error, operation);
    logDiagnosticEvent(
      "wix-cms-therapist-sync",
      "Unable to reconcile therapist public profile with Wix CMS.",
      {
        therapistProfileId: profile.id,
        ...(diagnostic ? { wixError: diagnostic } : { error }),
      },
    );
    throw new WixCmsTherapistSyncError(
      "Could not synchronize the therapist public profile with Wix CMS.",
      "WIX_CMS_SYNC_FAILED",
      diagnostic,
    );
  }
}
