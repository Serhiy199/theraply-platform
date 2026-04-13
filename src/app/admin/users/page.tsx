import { UserRole } from "@prisma/client";
import { AdminUsersTable } from "@/components/dashboard/admin/admin-users-table";
import { requireRole } from "@/lib/permissions";
import { getAdminClients } from "@/server/services/admin-operations.service";

export default async function AdminUsersPage() {
  await requireRole([UserRole.ADMIN]);
  const users = await getAdminClients();

  return <AdminUsersTable users={users} />;
}
