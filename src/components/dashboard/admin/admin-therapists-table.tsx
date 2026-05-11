import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import type {
  AdminTherapistListItem,
  AdminTherapistReviewItem,
} from "@/server/services/admin-operations.service";
import { formatAppDate, formatAppDateTime } from "@/lib/utils/date-time";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";
import { AdminTherapistReviewActions } from "@/components/dashboard/admin/admin-therapist-review-actions";

function formatDate(date: Date) {
  return formatAppDate(date);
}

function formatDateTime(date: Date | null) {
  return formatAppDateTime(date);
}

function getTherapistDisplayName(therapist: AdminTherapistListItem) {
  return (
    therapist.displayName ||
    [therapist.firstName, therapist.lastName].filter(Boolean).join(" ") ||
    therapist.email
  );
}

type AdminTherapistsTableProps = {
  therapists: AdminTherapistListItem[];
  pendingReviews: AdminTherapistReviewItem[];
};

function getReviewDisplayName(review: AdminTherapistReviewItem) {
  return (
    review.displayName ||
    [review.user.firstName, review.user.lastName].filter(Boolean).join(" ") ||
    review.user.email
  );
}

function hasProfileDraft(review: AdminTherapistReviewItem) {
  return review.profileDraft !== null;
}

export function AdminTherapistsTable({
  therapists,
  pendingReviews,
}: AdminTherapistsTableProps) {
  return (
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Admin oversight</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Therapists</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This operational view keeps therapist approval, calendar readiness, and payout
            completeness visible in one place.
          </p>
        </div>
        <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
          <span className="font-semibold text-slate-900">{therapists.length}</span>{" "}
          therapist profile{therapists.length === 1 ? "" : "s"}
        </InsetCard>
      </div>

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
            {pendingReviews.map((review) => (
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

                <dl className="mt-5 grid gap-4 text-sm text-slate-700">
                  <div>
                    <dt className="font-semibold text-slate-900">Display name</dt>
                    <dd className="mt-1">{review.displayName ?? "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-900">Specialization</dt>
                    <dd className="mt-1">{review.specialization ?? "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-900">Bio</dt>
                    <dd className="mt-1 leading-6">{review.bio ?? "Not provided"}</dd>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={review.user.emailVerified ? "success" : "warning"}>
                      {review.user.emailVerified ? "Email verified" : "Email not verified"}
                    </Badge>
                    <Badge variant={review.onboardingCompleted ? "success" : "neutral"}>
                      {review.onboardingCompleted ? "Onboarding complete" : "Onboarding incomplete"}
                    </Badge>
                    <Badge variant={hasProfileDraft(review) ? "info" : "neutral"}>
                      {hasProfileDraft(review) ? "Draft stored" : "No draft"}
                    </Badge>
                  </div>
                </dl>

                <div className="mt-5 border-t border-slate-200 pt-5">
                  <AdminTherapistReviewActions therapistProfileId={review.id} />
                </div>
              </InsetCard>
            ))}
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

      {therapists.length ? (
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Therapist</th>
                <th className="px-5 py-4">Approval</th>
                <th className="px-5 py-4">Specialization</th>
                <th className="px-5 py-4">Calendar</th>
                <th className="px-5 py-4">Payout</th>
                <th className="px-5 py-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {therapists.map((therapist) => (
                <tr key={therapist.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {getTherapistDisplayName(therapist)}
                    </p>
                    <p className="mt-1 text-slate-600">{therapist.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                      User {therapist.userId}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-2">
                      <Badge
                        className={`w-fit ${therapist.isApproved ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
                      >
                        {therapist.approvalStatus.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {therapist.specialization ?? "Not set"}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {therapist.googleCalendarEmail ?? "Not connected"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-2 text-slate-600">
                      <Badge
                        className={`w-fit ${therapist.payoutVerified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-700"}`}
                      >
                        {therapist.payoutVerified ? "Verified" : "Pending"}
                      </Badge>
                      <span>{therapist.payoutCountry ?? "No country yet"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(therapist.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6">
          <DashboardEmptyState
            meta="Admin oversight"
            title="No therapist profiles yet"
            description="Therapist operational profiles will appear here once onboarding and approval activity begins."
          />
        </div>
      )}
    </SurfaceCard>
  );
}
