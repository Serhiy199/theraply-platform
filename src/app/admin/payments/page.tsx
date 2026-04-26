import { UserRole } from "@prisma/client";
import { AdminAuditList } from "@/components/dashboard/admin/admin-audit-list";
import { AdminFinanceCases } from "@/components/dashboard/admin/admin-finance-cases";
import { AdminPaymentsTable } from "@/components/dashboard/admin/admin-payments-table";
import { requireRole } from "@/lib/permissions";
import {
  getAdminAuditLogs,
  getAdminPayments,
} from "@/server/services/admin-operations.service";
import { getAdminDashboardData } from "@/server/services/dashboard.service";

export default async function AdminPaymentsPage() {
  await requireRole([UserRole.ADMIN]);
  const [payments, auditLogs, dashboardData] = await Promise.all([
    getAdminPayments(),
    getAdminAuditLogs(),
    getAdminDashboardData(),
  ]);

  return (
    <div className="grid gap-6">
      <AdminFinanceCases cases={dashboardData.financeCases} payments={payments} />
      <AdminPaymentsTable payments={payments} />
      <AdminAuditList logs={auditLogs} />
    </div>
  );
}
