import { UserRole } from "@prisma/client";
import { AdminPromoCodes } from "@/components/dashboard/admin/admin-promo-codes";
import { requireRole } from "@/lib/permissions";
import { getAdminPromoCodes } from "@/server/services/promo-code-admin.service";

export default async function AdminPromoCodesPage() {
  const admin = await requireRole([UserRole.ADMIN]);
  const promoCodes = await getAdminPromoCodes(admin.id);

  return <AdminPromoCodes promoCodes={promoCodes} />;
}
