import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import type {
  AdminTherapistListItem,
  AdminTherapistReviewItem,
} from "@/server/services/admin-operations.service";
import { formatAppDate } from "@/lib/utils/date-time";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";
import { AdminTherapistReviewQueue } from "@/components/dashboard/admin/admin-therapist-review-queue";

function formatDate(date: Date) {
  return formatAppDate(date);
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

      <AdminTherapistReviewQueue pendingReviews={pendingReviews} />

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
