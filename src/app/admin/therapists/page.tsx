import { UserRole } from "@prisma/client";
import { AdminTherapistsTable } from "@/components/dashboard/admin/admin-therapists-table";
import { requireRole } from "@/lib/permissions";
import {
  getAdminPendingTherapistReviews,
  getAdminTherapists,
} from "@/server/services/admin-operations.service";

type AdminTherapistsPageProps = {
  searchParams: Promise<{
    wixSync?: string | string[];
  }>;
};

export default async function AdminTherapistsPage({
  searchParams,
}: AdminTherapistsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const { wixSync } = await searchParams;
  const [therapists, pendingReviews] = await Promise.all([
    getAdminTherapists(),
    getAdminPendingTherapistReviews(),
  ]);

  return (
    <AdminTherapistsTable
      therapists={therapists}
      pendingReviews={pendingReviews}
      wixSyncStatus={wixSync === "synced" || wixSync === "failed" ? wixSync : null}
    />
  );
}
