import { TherapistOverview } from "@/components/dashboard/therapist/therapist-overview";
import { TherapistStats } from "@/components/dashboard/therapist/therapist-stats";
import { requireRole } from "@/lib/permissions";
import { getTherapistDashboardData } from "@/server/services/dashboard.service";
import { UserRole } from "@prisma/client";

export default async function TherapistDashboardPage() {
  const user = await requireRole([UserRole.THERAPIST]);
  const data = await getTherapistDashboardData(user.id);

  return (
    <>
      <TherapistOverview email={user.email} data={data} />
      <TherapistStats stats={data.stats} />
    </>
  );
}
