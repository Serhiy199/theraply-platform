import Link from "next/link";
import { TherapistApprovalStatus, UserRole } from "@prisma/client";
import { ResendEmailVerificationForm } from "@/components/forms/resend-email-verification-form";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";
import { requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
    title: "Your therapist profile needs changes",
    description:
      "Your application was not approved. Review the rejection reason and update the profile before submitting again.",
  },
  SUSPENDED: {
    label: "Suspended",
    badge: "danger",
    title: "Your therapist access is suspended",
    description:
      "Your therapist profile is hidden and active therapist features are unavailable while this status is active.",
  },
};

export default async function TherapistOnboardingPage() {
  const user = await requireRole([UserRole.THERAPIST]);
  const account = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      emailVerified: true,
      therapistProfile: {
        select: {
          approvalStatus: true,
          onboardingCompleted: true,
          submittedForReviewAt: true,
          rejectedAt: true,
          rejectionReason: true,
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
            Next implementation
          </p>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This page is the locked status surface for Step 3.8. The editable therapist profile
            draft form, save draft action, and submit for review action will plug into this route in
            the onboarding stage.
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
