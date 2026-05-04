import { TherapistOverview } from "@/components/dashboard/therapist/therapist-overview";
import { TherapistStats } from "@/components/dashboard/therapist/therapist-stats";
import { requireActiveTherapistFeatures } from "@/lib/permissions";
import { getTherapistDashboardData } from "@/server/services/dashboard.service";

export default async function TherapistDashboardPage() {
  const user = await requireActiveTherapistFeatures();
  const data = await getTherapistDashboardData(user.id);

  return (
    <>
      <TherapistOverview email={user.email} data={data} />
      <TherapistStats stats={data.stats} />
    </>
  );
}
