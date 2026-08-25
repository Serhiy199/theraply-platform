import type { AdminPromoCodeListItem } from "@/server/services/promo-code-admin.service";
import { AdminPromoCodeActions } from "@/components/dashboard/admin/admin-promo-code-actions";
import { AdminPromoCodeCreateForm } from "@/components/dashboard/admin/admin-promo-code-create-form";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/utils/date-time";

function getStatusBadgeVariant(status: AdminPromoCodeListItem["status"]) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "EXPIRED") return "warning" as const;
  return "neutral" as const;
}

function formatExpiryInput(expiresAt: Date | null) {
  return expiresAt?.toISOString().slice(0, 16) ?? "";
}

function getCreatorName(promoCode: AdminPromoCodeListItem) {
  const creator = promoCode.createdByAdmin;
  if (!creator) return "System";

  return (
    [creator.firstName, creator.lastName].filter(Boolean).join(" ") ||
    creator.email
  );
}

export function AdminPromoCodes({
  promoCodes,
}: {
  promoCodes: AdminPromoCodeListItem[];
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <AdminPromoCodeCreateForm />

      <SurfaceCard as="section">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionEyebrow>Campaign lifecycle</SectionEyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">
              Promo Codes
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Uses count every Payment linked to a promo code, regardless of final payment status.
              Codes are never renamed or hard-deleted, preserving campaign history.
            </p>
          </div>
          <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
            <span className="font-semibold text-slate-900">{promoCodes.length}</span>{" "}
            promo code{promoCodes.length === 1 ? "" : "s"}
          </InsetCard>
        </div>

        {promoCodes.length ? (
          <div className="mt-6 max-w-full overflow-x-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70">
            <table className="min-w-[78rem] divide-y divide-slate-200 text-left text-sm text-slate-700">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-5 py-4">Code</th>
                  <th className="px-5 py-4">Discount</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Expiry</th>
                  <th className="px-5 py-4">Uses</th>
                  <th className="px-5 py-4">Created</th>
                  <th className="px-5 py-4">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {promoCodes.map((promoCode) => (
                  <tr key={promoCode.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-mono font-semibold text-slate-900">
                        {promoCode.code}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Created by {getCreatorName(promoCode)}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {promoCode.discountPercent}%
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={getStatusBadgeVariant(promoCode.status)}>
                        {promoCode.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {promoCode.expiresAt
                        ? formatAppDateTime(promoCode.expiresAt)
                        : "No expiry"}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {promoCode.usageCount}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      <p>{formatAppDateTime(promoCode.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Updated {formatAppDateTime(promoCode.updatedAt)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <AdminPromoCodeActions
                        promoCodeId={promoCode.id}
                        discountPercent={promoCode.discountPercent}
                        isActive={promoCode.isActive}
                        expiresAtInput={formatExpiryInput(promoCode.expiresAt)}
                        usageCount={promoCode.usageCount}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6">
            <DashboardEmptyState
              meta="Promo Codes"
              title="No promo codes yet"
              description="Create the first platform-funded promo campaign using the form above."
            />
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
