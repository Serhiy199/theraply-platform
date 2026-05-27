import { TherapistApprovalStatus, WixSyncStatus } from "@prisma/client";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { AdminTherapistWixSyncAction } from "@/components/dashboard/admin/admin-therapist-wix-sync-action";
import type {
  AdminTherapistListItem,
  AdminTherapistReviewItem,
} from "@/server/services/admin-operations.service";
import { formatAppDate } from "@/lib/utils/date-time";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
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

function getShortWixSyncError(error: string | null) {
  if (!error) {
    return "Synchronization failed.";
  }

  const normalized = error.trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function canRetryWixSync(therapist: AdminTherapistListItem) {
  return (
    therapist.approvalStatus === TherapistApprovalStatus.APPROVED &&
    (therapist.wixSyncStatus === WixSyncStatus.FAILED ||
      therapist.wixSyncStatus === WixSyncStatus.NOT_SYNCED)
  );
}

function WixSyncCell({ therapist }: { therapist: AdminTherapistListItem }) {
  return (
    <div className="flex min-w-56 flex-col gap-2">
      {therapist.wixSyncStatus === WixSyncStatus.SYNCED ? (
        <>
          <Badge variant="success" className="w-fit">
            Synced with Wix
          </Badge>
          <span className="text-xs text-slate-600">
            {therapist.wixSyncedAt ? formatDate(therapist.wixSyncedAt) : "Date unavailable"}
          </span>
        </>
      ) : therapist.wixSyncStatus === WixSyncStatus.FAILED ? (
        <>
          <Badge variant="danger" className="w-fit">
            Sync failed
          </Badge>
          <span className="max-w-64 text-xs leading-5 text-rose-700">
            {getShortWixSyncError(therapist.wixSyncError)}
          </span>
        </>
      ) : (
        <Badge variant="neutral" className="w-fit">
          Not synced
        </Badge>
      )}

      {canRetryWixSync(therapist) ? (
        <AdminTherapistWixSyncAction therapistProfileId={therapist.id} />
      ) : null}
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function CertificatesCell({ therapist }: { therapist: AdminTherapistListItem }) {
  if (!therapist.certificates.length) {
    return <span className="text-slate-500">No files</span>;
  }

  return (
    <details className="min-w-48">
      <summary className="cursor-pointer font-medium text-blue-700">
        View files ({therapist.certificates.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {therapist.certificates.map((certificate) => (
          <li key={certificate.id}>
            <a
              href={certificate.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="block max-w-64 truncate text-sm text-blue-700 underline underline-offset-2"
              title={certificate.fileName}
            >
              {certificate.fileName}
            </a>
            <span className="text-xs text-slate-500">
              {formatFileSize(certificate.size)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

type AdminTherapistsTableProps = {
  therapists: AdminTherapistListItem[];
  pendingReviews: AdminTherapistReviewItem[];
  wixSyncStatus?: "synced" | "failed" | null;
};

export function AdminTherapistsTable({
  therapists,
  pendingReviews,
  wixSyncStatus,
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

      {wixSyncStatus ? (
        <Alert tone={wixSyncStatus === "synced" ? "success" : "warning"} className="mt-6">
          {wixSyncStatus === "synced"
            ? "Therapist approved and synchronized with Wix."
            : "Therapist approved, but synchronization with Wix failed. Please retry the synchronization."}
        </Alert>
      ) : null}

      <AdminTherapistReviewQueue pendingReviews={pendingReviews} />

      {therapists.length ? (
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Therapist</th>
                <th className="px-5 py-4">Approval</th>
                <th className="px-5 py-4">Specialization</th>
                <th className="px-5 py-4">Certificates</th>
                <th className="px-5 py-4">Calendar</th>
                <th className="px-5 py-4">Payout</th>
                <th className="px-5 py-4">Wix Sync</th>
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
                  <td className="px-5 py-4">
                    <CertificatesCell therapist={therapist} />
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
                  <td className="px-5 py-4">
                    <WixSyncCell therapist={therapist} />
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
