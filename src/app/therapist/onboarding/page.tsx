import Link from "next/link";
import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { ResendEmailVerificationForm } from "@/components/forms/resend-email-verification-form";
import {
  TherapistOnboardingForm,
  type TherapistOnboardingFormValues,
} from "@/components/forms/therapist-onboarding-form";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";
import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  normalizeTherapistOnboardingDraft,
  type TherapistOnboardingDraft,
} from "@/lib/contracts/therapist-onboarding";

export const dynamic = "force-dynamic";

const statusMeta: Record<
  TherapistApprovalStatus,
  {
    label: string;
    badge: "neutral" | "success" | "warning" | "danger" | "info";
    title: string;
    description: string;
  }
> = {
  EMAIL_NOT_VERIFIED: {
    label: "Email not verified",
    badge: "warning",
    title: "Verify your email to continue",
    description:
      "Your therapist account is created, but the email address still needs to be verified before profile onboarding opens.",
  },
  PROFILE_INCOMPLETE: {
    label: "Profile incomplete",
    badge: "info",
    title: "Therapist profile onboarding is next",
    description:
      "Your email is verified. The expandable onboarding form will collect therapist profile fields before submission for review.",
  },
  PENDING_REVIEW: {
    label: "Pending review",
    badge: "warning",
    title: "Your profile is waiting for admin review",
    description:
      "Your therapist profile has been submitted. You can access this status page while the active therapist workspace remains locked.",
  },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    badge: "warning",
    title: "Your profile needs updates",
    description:
      "An administrator has requested changes to your therapist profile. Update the required information and submit it for review again.",
  },
  APPROVED: {
    label: "Approved",
    badge: "success",
    title: "Your therapist profile is approved",
    description:
      "Your therapist profile is approved and active therapist features are available.",
  },
  REJECTED: {
    label: "Rejected",
    badge: "danger",
    title: "Your therapist application was not approved",
    description:
      "Your application has been declined and can no longer be edited or resubmitted through onboarding.",
  },
  SUSPENDED: {
    label: "Suspended",
    badge: "danger",
    title: "Your therapist access is suspended",
    description:
      "Your therapist profile is hidden and active therapist features are unavailable while this status is active.",
  },
};

function getStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getFullName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

function hasDraftTextValue(draft: TherapistOnboardingDraft) {
  return [
    draft.nameAndSurname,
    draft.gender,
    draft.email,
    draft.contactNumber,
    draft.therapyServicesProvided,
    draft.yearsOfExperience,
    draft.educationAndCertifications,
    draft.specialisation,
    draft.pricePerHour,
    draft.displayName,
    draft.bio,
    draft.specialization,
  ].some((fieldValue) => typeof fieldValue === "string" && fieldValue.trim().length > 0);
}

function getDraftFromProfileDraft(value: unknown): TherapistOnboardingDraft | null {
  const draft = normalizeTherapistOnboardingDraft(value);

  return hasDraftTextValue(draft) ? draft : null;
}

function getOnboardingInitialValues(
  account:
    | {
        email: string;
        firstName: string | null;
        lastName: string | null;
        therapistProfile: {
          displayName: string | null;
          bio: string | null;
          specialization: string | null;
          gender: string | null;
          contactNumber: string | null;
          therapyServicesProvided: string | null;
          yearsOfExperience: string | null;
          educationAndCertifications: string | null;
          specialisation: string | null;
          pricePerHour: string | null;
          profileDraft: unknown;
          certificates: {
            id: string;
            fileName: string;
            fileUrl: string;
            publicId: string;
            storageProvider: string;
            mimeType: string;
            size: number;
            uploadedAt: Date;
          }[];
        } | null;
      }
    | null
    | undefined,
): TherapistOnboardingFormValues {
  const profile = account?.therapistProfile;
  const draft = getDraftFromProfileDraft(profile?.profileDraft);
  const userName = account ? getFullName(account) : "";
  const specialisation = getStringValue(
    draft?.specialisation ?? profile?.specialisation ?? draft?.specialization ?? profile?.specialization,
  );
  const therapyServicesProvided = getStringValue(
    draft?.therapyServicesProvided ?? profile?.therapyServicesProvided ?? draft?.bio ?? profile?.bio,
  );

  return {
    nameAndSurname: userName,
    gender: getStringValue(draft?.gender ?? profile?.gender),
    email: account?.email ?? "",
    contactNumber: getStringValue(draft?.contactNumber ?? profile?.contactNumber),
    therapyServicesProvided,
    yearsOfExperience: getStringValue(draft?.yearsOfExperience ?? profile?.yearsOfExperience),
    educationAndCertifications: getStringValue(
      draft?.educationAndCertifications ?? profile?.educationAndCertifications,
    ),
    specialisation,
    pricePerHour: getStringValue(draft?.pricePerHour ?? profile?.pricePerHour),
    certificates: profile?.certificates ?? [],
    displayName: getStringValue(draft?.displayName ?? profile?.displayName ?? userName),
    bio: therapyServicesProvided,
    specialization: specialisation,
  };
}

export default async function TherapistOnboardingPage() {
  const user = await requireRole([UserRole.THERAPIST]);
  const account = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
      therapistProfile: {
        select: {
          approvalStatus: true,
          onboardingCompleted: true,
          submittedForReviewAt: true,
          rejectedAt: true,
          rejectionReason: true,
          displayName: true,
          bio: true,
          specialization: true,
          gender: true,
          contactNumber: true,
          therapyServicesProvided: true,
          yearsOfExperience: true,
          educationAndCertifications: true,
          specialisation: true,
          pricePerHour: true,
          profileDraft: true,
          certificates: {
            orderBy: {
              uploadedAt: "desc",
            },
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              publicId: true,
              storageProvider: true,
              mimeType: true,
              size: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  const approvalStatus =
    account?.emailVerified === false
      ? TherapistApprovalStatus.EMAIL_NOT_VERIFIED
      : account?.therapistProfile?.approvalStatus ?? TherapistApprovalStatus.EMAIL_NOT_VERIFIED;
  const meta = statusMeta[approvalStatus];
  const isApproved = approvalStatus === TherapistApprovalStatus.APPROVED;

  return (
    <SurfaceCard as="section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionEyebrow>Therapist onboarding</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">{meta.title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{meta.description}</p>
        </div>
        <Badge variant={meta.badge} size="sm">
          {meta.label}
        </Badge>
      </div>

      {!isApproved ? (
        <Alert tone="warning" title="Active therapist features are locked" className="mt-6">
          Dashboard data, booking request decisions, client lists, payout setup, and calendar
          integration are available only after admin approval.
        </Alert>
      ) : null}

      {approvalStatus === TherapistApprovalStatus.EMAIL_NOT_VERIFIED ? (
        <div className="mt-6">
          <ResendEmailVerificationForm />
        </div>
      ) : null}

      {approvalStatus === TherapistApprovalStatus.REJECTED &&
      account?.therapistProfile?.rejectionReason ? (
        <Alert tone="error" title="Rejection reason" className="mt-6">
          {account.therapistProfile.rejectionReason}
        </Alert>
      ) : null}

      {approvalStatus === TherapistApprovalStatus.PROFILE_INCOMPLETE ||
      approvalStatus === TherapistApprovalStatus.CHANGES_REQUESTED ? (
        <InsetCard tone="plain" className="mt-6">
          <SectionEyebrow>Profile form</SectionEyebrow>
          <TherapistOnboardingForm
            initialValues={getOnboardingInitialValues(account)}
          />
        </InsetCard>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <InsetCard tone="plain">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Current state
          </p>
          <dl className="mt-4 grid gap-3 text-sm text-slate-600">
            <div className="flex justify-between gap-4">
              <dt>Email verified</dt>
              <dd className="font-semibold text-slate-900">
                {account?.emailVerified ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Onboarding completed</dt>
              <dd className="font-semibold text-slate-900">
                {account?.therapistProfile?.onboardingCompleted ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Submitted for review</dt>
              <dd className="font-semibold text-slate-900">
                {account?.therapistProfile?.submittedForReviewAt ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        </InsetCard>

        <InsetCard tone="muted">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Next step
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            {approvalStatus === TherapistApprovalStatus.PROFILE_INCOMPLETE ||
            approvalStatus === TherapistApprovalStatus.CHANGES_REQUESTED
              ? "Complete the profile fields, save your draft when needed, and submit the profile for admin review when it is ready."
              : approvalStatus === TherapistApprovalStatus.PENDING_REVIEW
                ? "Your profile is read-only while it waits for admin review."
                : approvalStatus === TherapistApprovalStatus.APPROVED
                  ? "Your profile is approved and your therapist workspace is available."
                  : approvalStatus === TherapistApprovalStatus.REJECTED
                    ? "Your therapist application was not approved and cannot be resubmitted from this account."
                  : approvalStatus === TherapistApprovalStatus.SUSPENDED
                    ? "Your profile is locked while this account is suspended."
                    : "Verify your email before continuing with therapist onboarding."}
          </p>
          {isApproved ? (
            <Link
              href="/therapist/dashboard"
              className="mt-5 inline-flex rounded-full border border-slate-900 bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
            >
              Open therapist dashboard
            </Link>
          ) : null}
        </InsetCard>
      </div>
    </SurfaceCard>
  );
}
