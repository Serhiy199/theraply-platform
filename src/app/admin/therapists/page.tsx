import { UserRole } from "@prisma/client";
import { AdminTherapistsTable } from "@/components/dashboard/admin/admin-therapists-table";
import { requireRole } from "@/lib/permissions";
import {
  getAdminPendingTherapistReviews,
  getAdminTherapists,
} from "@/server/services/admin-operations.service";

export default async function AdminTherapistsPage() {
  await requireRole([UserRole.ADMIN]);
  const [therapists, pendingReviews] = await Promise.all([
    getAdminTherapists(),
    getAdminPendingTherapistReviews(),
  ]);

  return <AdminTherapistsTable therapists={therapists} pendingReviews={pendingReviews} />;
}
