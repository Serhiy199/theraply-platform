import { UserRole } from "@prisma/client";
import { AdminAuditList } from "@/components/dashboard/admin/admin-audit-list";
import { AdminPaymentsTable } from "@/components/dashboard/admin/admin-payments-table";
import { requireRole } from "@/lib/permissions";
import {
  getAdminAuditLogs,
  getAdminPayments,
} from "@/server/services/admin-operations.service";

export default async function AdminPaymentsPage() {
  await requireRole([UserRole.ADMIN]);
  const [payments, auditLogs] = await Promise.all([
    getAdminPayments(),
    getAdminAuditLogs(),
  ]);

  return (
    <div className="grid gap-6">
      <AdminPaymentsTable payments={payments} />
      <AdminAuditList logs={auditLogs} />
    </div>
  );
}
