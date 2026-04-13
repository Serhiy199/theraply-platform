import { UserRole } from "@prisma/client";
import { AdminTherapistsTable } from "@/components/dashboard/admin/admin-therapists-table";
import { requireRole } from "@/lib/permissions";
import { getAdminTherapists } from "@/server/services/admin-operations.service";

export default async function AdminTherapistsPage() {
  await requireRole([UserRole.ADMIN]);
  const therapists = await getAdminTherapists();

  return <AdminTherapistsTable therapists={therapists} />;
}
