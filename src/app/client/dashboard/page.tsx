import { ClientOverview } from "@/components/dashboard/client/client-overview";
import { ClientStats } from "@/components/dashboard/client/client-stats";
import { requireRole } from "@/lib/permissions";
import { getClientDashboardData } from "@/server/services/dashboard.service";
import { UserRole } from "@prisma/client";

export default async function ClientDashboardPage() {
  const user = await requireRole([UserRole.CLIENT]);
  const data = await getClientDashboardData(user.id);

  return (
    <>
      <ClientOverview email={user.email} data={data} />
      <ClientStats stats={data.stats} />
    </>
  );
}
