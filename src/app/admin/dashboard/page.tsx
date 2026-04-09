import { AdminOverview } from "@/components/dashboard/admin/admin-overview";
import { AdminStats } from "@/components/dashboard/admin/admin-stats";
import { getAdminDashboardData } from "@/server/services/dashboard.service";

export default async function AdminDashboardPage() {
  const data = await getAdminDashboardData();

  return (
    <>
      <AdminOverview data={data} />
      <AdminStats stats={data.stats} />
    </>
  );
}
