import {
  Prisma,
  TherapistApprovalStatus,
  UserRole,
} from "@prisma/client";
import { isStripeConnectReady } from "@/lib/stripe/stripe-connect-readiness";

export type TherapistReadinessReason =
  | "NOT_THERAPIST"
  | "ACCOUNT_INACTIVE"
  | "EMAIL_NOT_VERIFIED"
  | "NOT_APPROVED"
  | "ONBOARDING_INCOMPLETE"
  | "PRICE_MISSING"
  | "CALENDAR_NOT_READY"
  | "STRIPE_NOT_READY"
  | "PUBLIC_PROFILE_INCOMPLETE";

type ReadinessUser = {
  role?: UserRole | null;
  isActive?: boolean | null;
  emailVerified?: boolean | null;
};

type ReadinessProfile = {
  approvalStatus?: TherapistApprovalStatus | null;
  isApproved?: boolean | null;
  onboardingCompleted?: boolean | null;
  sessionPricePence?: number | null;
  isGoogleCalendarConnected?: boolean | null;
  googleCalendarId?: string | null;
  googleRefreshToken?: string | null;
  stripeAccountId?: string | null;
  stripePayoutsEnabled?: boolean | null;
  stripeDetailsSubmitted?: boolean | null;
  displayName?: string | null;
  bio?: string | null;
  specialization?: string | null;
  therapyServicesProvided?: string | null;
  yearsOfExperience?: string | null;
  profilePhotoUrl?: string | null;
};

function hasMeaningfulText(value?: string | null) {
  return Boolean(value?.trim());
}

export function isTherapistCalendarReady(profile: ReadinessProfile) {
  return Boolean(
    profile.isGoogleCalendarConnected &&
      hasMeaningfulText(profile.googleCalendarId) &&
      hasMeaningfulText(profile.googleRefreshToken),
  );
}

export function isTherapistPublicProfileComplete(profile: ReadinessProfile) {
  return [
    profile.displayName,
    profile.bio,
    profile.specialization,
    profile.therapyServicesProvided,
    profile.yearsOfExperience,
    profile.profilePhotoUrl,
  ].every(hasMeaningfulText);
}

export function evaluateTherapistReadiness(input: {
  user: ReadinessUser;
  profile: ReadinessProfile | null | undefined;
}) {
  const { user } = input;
  const profile = input.profile ?? {};
  const reasons: TherapistReadinessReason[] = [];

  if (user.role !== UserRole.THERAPIST) reasons.push("NOT_THERAPIST");
  if (!user.isActive) reasons.push("ACCOUNT_INACTIVE");
  if (!user.emailVerified) reasons.push("EMAIL_NOT_VERIFIED");
  if (
    profile.approvalStatus !== TherapistApprovalStatus.APPROVED ||
    !profile.isApproved
  ) {
    reasons.push("NOT_APPROVED");
  }
  if (!profile.onboardingCompleted) reasons.push("ONBOARDING_INCOMPLETE");
  if (!profile.sessionPricePence || profile.sessionPricePence <= 0) {
    reasons.push("PRICE_MISSING");
  }
  if (!isTherapistCalendarReady(profile)) reasons.push("CALENDAR_NOT_READY");
  if (
    !isStripeConnectReady({
      ...profile,
      stripeAccountId: profile.stripeAccountId?.trim(),
    })
  ) {
    reasons.push("STRIPE_NOT_READY");
  }

  const bookingReady = reasons.length === 0;

  if (!isTherapistPublicProfileComplete(profile)) {
    reasons.push("PUBLIC_PROFILE_INCOMPLETE");
  }

  return {
    bookingReady,
    publicReady: bookingReady && !reasons.includes("PUBLIC_PROFILE_INCOMPLETE"),
    reasons,
  };
}

export function buildBookableTherapistWhere(): Prisma.UserWhereInput {
  // Persisted integration identifiers are normalized by their write paths. The
  // pure evaluator remains stricter and also rejects whitespace-only values.
  return {
    role: UserRole.THERAPIST,
    isActive: true,
    emailVerified: true,
    therapistProfile: {
      is: {
        approvalStatus: TherapistApprovalStatus.APPROVED,
        isApproved: true,
        onboardingCompleted: true,
        sessionPricePence: { gt: 0 },
        isGoogleCalendarConnected: true,
        googleCalendarId: { not: "" },
        googleRefreshToken: { not: "" },
        stripeAccountId: { not: "" },
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    },
  };
}
