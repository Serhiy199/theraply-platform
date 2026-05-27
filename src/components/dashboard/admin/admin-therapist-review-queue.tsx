import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { AdminTherapistReviewActions } from "@/components/dashboard/admin/admin-therapist-review-actions";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow } from "@/components/ui/card";
import { normalizeTherapistOnboardingDraft } from "@/lib/contracts/therapist-onboarding";
import { formatAppDateTime } from "@/lib/utils/date-time";
import type { AdminTherapistReviewItem } from "@/server/services/admin-operations.service";

type AdminTherapistReviewQueueProps = {
  pendingReviews: AdminTherapistReviewItem[];
};

type ReviewDraftFields = {
  nameAndSurname: string | null;
  gender: string | null;
  email: string | null;
  contactNumber: string | null;
  therapyServicesProvided: string | null;
  yearsOfExperience: string | null;
  educationAndCertifications: string | null;
  specialisation: string | null;
  pricePerHour: string | null;
  displayName: string | null;
  bio: string | null;
  specialization: string | null;
};

function formatDateTime(date: Date | null) {
  return formatAppDateTime(date);
}

function getReviewDisplayName(review: AdminTherapistReviewItem) {
  return (
    review.displayName ||
    [review.user.firstName, review.user.lastName].filter(Boolean).join(" ") ||
    review.user.email
  );
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getReviewUserName(review: AdminTherapistReviewItem) {
  return [review.user.firstName, review.user.lastName].filter(Boolean).join(" ").trim() || review.user.email;
}

function getReadableDraft(profileDraft: unknown): ReviewDraftFields | null {
  const draft = normalizeTherapistOnboardingDraft(profileDraft);
  const readableDraft = {
    nameAndSurname: normalizeText(draft.nameAndSurname),
    gender: normalizeText(draft.gender),
    email: normalizeText(draft.email),
    contactNumber: normalizeText(draft.contactNumber),
    therapyServicesProvided: normalizeText(draft.therapyServicesProvided),
    yearsOfExperience: normalizeText(draft.yearsOfExperience),
    educationAndCertifications: normalizeText(draft.educationAndCertifications),
    specialisation: normalizeText(draft.specialisation),
    pricePerHour: normalizeText(draft.pricePerHour),
    displayName: normalizeText(draft.displayName),
    bio: normalizeText(draft.bio),
    specialization: normalizeText(draft.specialization),
  };
  const hasReadableValue = Object.values(readableDraft).some(Boolean);

  return hasReadableValue ? readableDraft : null;
}

function getDraftDifferences(review: AdminTherapistReviewItem) {
  const draft = getReadableDraft(review.profileDraft);

  if (!draft) {
    return [];
  }

  return [
    {
      label: "Name & Surname",
      profileValue: normalizeText(getReviewUserName(review)),
      draftValue: draft.nameAndSurname,
    },
    {
      label: "Email",
      profileValue: normalizeText(review.user.email),
      draftValue: draft.email,
    },
    {
      label: "Gender",
      profileValue: normalizeText(review.gender),
      draftValue: draft.gender,
    },
    {
      label: "Contact number",
      profileValue: normalizeText(review.contactNumber),
      draftValue: draft.contactNumber,
    },
    {
      label: "Therapy services provided",
      profileValue: normalizeText(review.therapyServicesProvided),
      draftValue: draft.therapyServicesProvided,
    },
    {
      label: "Years of experience",
      profileValue: normalizeText(review.yearsOfExperience),
      draftValue: draft.yearsOfExperience,
    },
    {
      label: "Education & certifications",
      profileValue: normalizeText(review.educationAndCertifications),
      draftValue: draft.educationAndCertifications,
    },
    {
      label: "Specialisation",
      profileValue: normalizeText(review.specialisation ?? review.specialization),
      draftValue: draft.specialisation ?? draft.specialization,
    },
    {
      label: "Price per hour",
      profileValue: normalizeText(review.pricePerHour),
      draftValue: draft.pricePerHour,
    },
  ].filter((field) => field.draftValue !== field.profileValue);
}

function FieldValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="font-semibold text-slate-900">{label}</dt>
      <dd className="mt-1 leading-6">{value ?? "Not provided"}</dd>
    </div>
  );
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "Unknown size";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function CertificatesList({ review }: { review: AdminTherapistReviewItem }) {
  if (!review.certificates.length) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        No certificates uploaded yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {review.certificates.map((certificate) => (
        <li
          key={certificate.id}
          className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <a
                href={certificate.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-slate-900 underline-offset-4 hover:underline"
              >
                {certificate.fileName}
              </a>
              <p className="mt-1 text-slate-500">
                {certificate.mimeType} · {formatFileSize(certificate.size)}
              </p>
              <p className="mt-1 break-all text-xs text-slate-500">
                {certificate.storageProvider}: {certificate.publicId}
              </p>
            </div>
            <Badge variant="neutral" size="sm">
              {formatDateTime(certificate.uploadedAt)}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DraftDifferences({ review }: { review: AdminTherapistReviewItem }) {
  const differences = getDraftDifferences(review);

  if (!differences.length) {
    return (
      <p className="text-sm leading-6 text-slate-600">
        Stored draft matches the submitted profile fields.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {differences.map((difference) => (
        <div
          key={difference.label}
          className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm"
        >
          <p className="font-semibold text-slate-900">{difference.label}</p>
          <dl className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Profile field
              </dt>
              <dd className="mt-1 leading-6 text-slate-700">
                {difference.profileValue ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Stored draft
              </dt>
              <dd className="mt-1 leading-6 text-slate-700">
                {difference.draftValue ?? "Not provided"}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

export function AdminTherapistReviewQueue({
  pendingReviews,
}: AdminTherapistReviewQueueProps) {
  return (
    <section className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionEyebrow>Review queue</SectionEyebrow>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">
            Pending therapist reviews
          </h3>
        </div>
        <Badge variant={pendingReviews.length ? "warning" : "neutral"} size="sm">
          {pendingReviews.length} pending
        </Badge>
      </div>

      {pendingReviews.length ? (
        <div className="mt-5 grid gap-4">
          {pendingReviews.map((review) => {
            const hasDraftDifferences = getDraftDifferences(review).length > 0;

            return (
              <InsetCard key={review.id} tone="plain">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {getReviewDisplayName(review)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{review.user.email}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                      Submitted {formatDateTime(review.submittedForReviewAt)}
                    </p>
                  </div>
                  <Badge variant="warning">{review.approvalStatus.replaceAll("_", " ")}</Badge>
                </div>

                <details className="mt-5 rounded-2xl border border-slate-200 bg-white/70 p-4" open>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Submitted profile details
                  </summary>
                  <dl className="mt-4 grid gap-4 text-sm text-slate-700">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FieldValue label="Name & Surname" value={getReviewUserName(review)} />
                      <FieldValue label="Email" value={review.user.email} />
                      <FieldValue label="Gender" value={review.gender} />
                      <FieldValue label="Contact number" value={review.contactNumber} />
                      <FieldValue label="Years of experience" value={review.yearsOfExperience} />
                      <FieldValue label="Price per hour" value={review.pricePerHour} />
                    </div>
                    <FieldValue
                      label="Therapy services provided"
                      value={review.therapyServicesProvided ?? review.bio}
                    />
                    <FieldValue
                      label="Education & certifications"
                      value={review.educationAndCertifications}
                    />
                    <FieldValue
                      label="Specialisation"
                      value={review.specialisation ?? review.specialization}
                    />
                    <div>
                      <dt className="font-semibold text-slate-900">Certificates</dt>
                      <dd className="mt-3">
                        <CertificatesList review={review} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={review.user.emailVerified ? "success" : "warning"}>
                        {review.user.emailVerified ? "Email verified" : "Email not verified"}
                      </Badge>
                      <Badge variant={review.onboardingCompleted ? "success" : "neutral"}>
                        {review.onboardingCompleted
                          ? "Onboarding complete"
                          : "Onboarding incomplete"}
                      </Badge>
                      <Badge variant={hasDraftDifferences ? "info" : "neutral"}>
                        {hasDraftDifferences ? "Draft differs" : "Draft aligned"}
                      </Badge>
                    </div>
                  </dl>
                </details>

                <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Profile draft comparison
                  </summary>
                  <div className="mt-4">
                    <DraftDifferences review={review} />
                  </div>
                </details>

                <div className="mt-5 border-t border-slate-200 pt-5">
                  <AdminTherapistReviewActions therapistProfileId={review.id} />
                </div>
              </InsetCard>
            );
          })}
        </div>
      ) : (
        <div className="mt-5">
          <DashboardEmptyState
            meta="Review queue"
            title="No therapist profiles pending review"
            description="Submitted therapist onboarding profiles will appear here for approval or rejection."
          />
        </div>
      )}
    </section>
  );
}
