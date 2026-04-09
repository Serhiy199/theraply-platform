import type { getClientDashboardData } from "@/server/services/dashboard.service";
import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";

type ClientStatsProps = {
  stats: Awaited<ReturnType<typeof getClientDashboardData>>["stats"];
};

export function ClientStats({ stats }: ClientStatsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
      {stats.map((stat) => (
        <DashboardStatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
      ))}
    </div>
  );
}
