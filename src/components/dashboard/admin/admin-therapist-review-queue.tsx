import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { AdminTherapistReviewActions } from "@/components/dashboard/admin/admin-therapist-review-actions";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/utils/date-time";
import type { AdminTherapistReviewItem } from "@/server/services/admin-operations.service";

type AdminTherapistReviewQueueProps = {
  pendingReviews: AdminTherapistReviewItem[];
};

type ReviewDraftFields = {
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

function getReadableDraft(profileDraft: unknown): ReviewDraftFields | null {
  if (!profileDraft || typeof profileDraft !== "object" || Array.isArray(profileDraft)) {
    return null;
  }

  const draft = profileDraft as Partial<ReviewDraftFields>;
  const readableDraft = {
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
      label: "Display name",
      profileValue: normalizeText(review.displayName),
      draftValue: draft.displayName,
    },
    {
      label: "Specialization",
      profileValue: normalizeText(review.specialization),
      draftValue: draft.specialization,
    },
    {
      label: "Bio",
      profileValue: normalizeText(review.bio),
      draftValue: draft.bio,
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
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
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
                    <FieldValue label="Display name" value={review.displayName} />
                    <FieldValue label="Specialization" value={review.specialization} />
                    <FieldValue label="Bio" value={review.bio} />
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
