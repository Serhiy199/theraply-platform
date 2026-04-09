import type { getTherapistDashboardData } from "@/server/services/dashboard.service";
import { DashboardStatCard } from "@/components/dashboard/dashboard-stat-card";

type TherapistStatsProps = {
  stats: Awaited<ReturnType<typeof getTherapistDashboardData>>["stats"];
};

export function TherapistStats({ stats }: TherapistStatsProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
      {stats.map((stat) => (
        <DashboardStatCard key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
      ))}
    </div>
  );
}
