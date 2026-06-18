import "server-only";
import { Prisma, StripeConnectOnboardingStatus, UserRole } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe/stripe";
import { isStripeConfigured } from "@/lib/stripe/stripe-config";
import { createAuditLogEntryBestEffort, logDiagnosticEvent } from "@/server/services/audit-log.service";

export class StripeConnectServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "STRIPE_NOT_CONFIGURED"
      | "THERAPIST_PROFILE_NOT_FOUND"
      | "ACCOUNT_CREATE_FAILED"
      | "ACCOUNT_LINK_CREATE_FAILED"
      | "ACCOUNT_SYNC_FAILED",
  ) {
    super(message);
    this.name = "StripeConnectServiceError";
  }
}

export type StripeConnectStatusView = {
  stripeAccountId: string | null;
  stripeOnboardingStatus: StripeConnectOnboardingStatus;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingCompletedAt: Date | null;
  stripeAccountSyncedAt: Date | null;
  stripeDisabledReason: string | null;
  isReady: boolean;
};

function assertStripeConfigured() {
  if (!isStripeConfigured()) {
    throw new StripeConnectServiceError(
      "Stripe is not configured yet in this environment.",
      "STRIPE_NOT_CONFIGURED",
    );
  }
}

function buildAppUrl(path: string) {
  const baseUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";

  return new URL(path, baseUrl).toString();
}

function getAccountDisabledReason(account: Stripe.Account) {
  const reason = account.requirements?.disabled_reason;
  return typeof reason === "string" && reason.trim() ? reason : null;
}

function getRequirementsDue(account: Stripe.Account) {
  const currentlyDue = account.requirements?.currently_due ?? [];
  const eventuallyDue = account.requirements?.eventually_due ?? [];
  const pastDue = account.requirements?.past_due ?? [];

  if (!currentlyDue.length && !eventuallyDue.length && !pastDue.length) {
    return Prisma.DbNull;
  }

  return {
    currentlyDue,
    eventuallyDue,
    pastDue,
  };
}

function getOnboardingStatus(account: Stripe.Account): StripeConnectOnboardingStatus {
  const disabledReason = getAccountDisabledReason(account);

  if (account.payouts_enabled && account.details_submitted) {
    return StripeConnectOnboardingStatus.READY;
  }

  if (disabledReason) {
    return StripeConnectOnboardingStatus.DISABLED;
  }

  if (account.details_submitted) {
    return StripeConnectOnboardingStatus.RESTRICTED;
  }

  return StripeConnectOnboardingStatus.ACCOUNT_CREATED;
}

async function getTherapistProfileOrThrow(therapistUserId: string) {
  const therapistProfile = await prisma.therapistProfile.findFirst({
    where: {
      userId: therapistUserId,
      user: {
        role: UserRole.THERAPIST,
      },
    },
    select: {
      id: true,
      userId: true,
      displayName: true,
      user: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      stripeAccountId: true,
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingCompletedAt: true,
      stripeAccountSyncedAt: true,
      stripeDisabledReason: true,
    },
  });

  if (!therapistProfile) {
    throw new StripeConnectServiceError(
      "Therapist profile not found.",
      "THERAPIST_PROFILE_NOT_FOUND",
    );
  }

  return therapistProfile;
}

function getTherapistDisplayName(therapistProfile: Awaited<ReturnType<typeof getTherapistProfileOrThrow>>) {
  return (
    therapistProfile.displayName?.trim() ||
    [therapistProfile.user.firstName, therapistProfile.user.lastName].filter(Boolean).join(" ") ||
    therapistProfile.user.email
  );
}

export function isStripeConnectReady(input: {
  stripeAccountId?: string | null;
  stripePayoutsEnabled?: boolean | null;
  stripeDetailsSubmitted?: boolean | null;
  stripeOnboardingStatus?: StripeConnectOnboardingStatus | null;
}) {
  return Boolean(
    input.stripeAccountId &&
      input.stripePayoutsEnabled &&
      input.stripeDetailsSubmitted &&
      input.stripeOnboardingStatus === StripeConnectOnboardingStatus.READY,
  );
}

export async function syncTherapistStripeAccountStatus(therapistUserId: string): Promise<StripeConnectStatusView> {
  assertStripeConfigured();
  const therapistProfile = await getTherapistProfileOrThrow(therapistUserId);

  if (!therapistProfile.stripeAccountId) {
    return {
      stripeAccountId: null,
      stripeOnboardingStatus: therapistProfile.stripeOnboardingStatus,
      stripeChargesEnabled: therapistProfile.stripeChargesEnabled,
      stripePayoutsEnabled: therapistProfile.stripePayoutsEnabled,
      stripeDetailsSubmitted: therapistProfile.stripeDetailsSubmitted,
      stripeOnboardingCompletedAt: therapistProfile.stripeOnboardingCompletedAt,
      stripeAccountSyncedAt: therapistProfile.stripeAccountSyncedAt,
      stripeDisabledReason: therapistProfile.stripeDisabledReason,
      isReady: false,
    };
  }

  const stripe = getStripeClient();

  try {
    const account = await stripe.accounts.retrieve(therapistProfile.stripeAccountId);
    const onboardingStatus = getOnboardingStatus(account);
    const now = new Date();
    const isReady =
      onboardingStatus === StripeConnectOnboardingStatus.READY &&
      account.payouts_enabled &&
      account.details_submitted;

    const updated = await prisma.therapistProfile.update({
      where: { id: therapistProfile.id },
      data: {
        stripeOnboardingStatus: onboardingStatus,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeDetailsSubmitted: account.details_submitted,
        stripeOnboardingCompletedAt:
          isReady && !therapistProfile.stripeOnboardingCompletedAt
            ? now
            : therapistProfile.stripeOnboardingCompletedAt,
        stripeAccountSyncedAt: now,
        stripeRequirementsDue: getRequirementsDue(account),
        stripeDisabledReason: getAccountDisabledReason(account),
      },
      select: {
        stripeAccountId: true,
        stripeOnboardingStatus: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardingCompletedAt: true,
        stripeAccountSyncedAt: true,
        stripeDisabledReason: true,
      },
    });

    return {
      ...updated,
      isReady: isStripeConnectReady(updated),
    };
  } catch (error) {
    logDiagnosticEvent("stripe-connect", "Unable to sync Stripe connected account.", {
      therapistUserId,
      stripeAccountId: therapistProfile.stripeAccountId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new StripeConnectServiceError(
      error instanceof Error ? error.message : "Unable to sync Stripe account.",
      "ACCOUNT_SYNC_FAILED",
    );
  }
}

export async function createTherapistStripeAccountLink(therapistUserId: string) {
  assertStripeConfigured();
  const therapistProfile = await getTherapistProfileOrThrow(therapistUserId);
  const stripe = getStripeClient();
  let stripeAccountId = therapistProfile.stripeAccountId;

  try {
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: therapistProfile.user.email,
        business_type: "individual",
        business_profile: {
          name: getTherapistDisplayName(therapistProfile),
          product_description: "Online therapy sessions booked through Theraply.",
        },
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          therapistUserId,
          therapistProfileId: therapistProfile.id,
        },
      });

      stripeAccountId = account.id;

      await prisma.therapistProfile.update({
        where: { id: therapistProfile.id },
        data: {
          stripeAccountId,
          stripeOnboardingStatus: StripeConnectOnboardingStatus.ACCOUNT_CREATED,
          stripeChargesEnabled: account.charges_enabled,
          stripePayoutsEnabled: account.payouts_enabled,
          stripeDetailsSubmitted: account.details_submitted,
          stripeAccountSyncedAt: new Date(),
          stripeRequirementsDue: getRequirementsDue(account),
          stripeDisabledReason: getAccountDisabledReason(account),
        },
      });

      await createAuditLogEntryBestEffort({
        actorUserId: therapistUserId,
        entityType: "TherapistProfile",
        entityId: therapistProfile.id,
        action: "STRIPE_CONNECT_ACCOUNT_CREATED",
        after: {
          stripeAccountId,
        },
      });
    }
  } catch (error) {
    throw new StripeConnectServiceError(
      error instanceof Error ? error.message : "Unable to create Stripe connected account.",
      "ACCOUNT_CREATE_FAILED",
    );
  }

  try {
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: buildAppUrl("/api/stripe/connect/refresh"),
      return_url: buildAppUrl("/api/stripe/connect/return"),
      type: "account_onboarding",
    });

    await prisma.therapistProfile.update({
      where: { id: therapistProfile.id },
      data: {
        stripeOnboardingStatus: StripeConnectOnboardingStatus.ONBOARDING_STARTED,
      },
    });

    await createAuditLogEntryBestEffort({
      actorUserId: therapistUserId,
      entityType: "TherapistProfile",
      entityId: therapistProfile.id,
      action: "STRIPE_CONNECT_ACCOUNT_LINK_CREATED",
      after: {
        stripeAccountId,
      },
    });

    return {
      url: accountLink.url,
      stripeAccountId,
    };
  } catch (error) {
    throw new StripeConnectServiceError(
      error instanceof Error ? error.message : "Unable to create Stripe onboarding link.",
      "ACCOUNT_LINK_CREATE_FAILED",
    );
  }
}
