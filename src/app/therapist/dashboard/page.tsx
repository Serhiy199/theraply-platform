import { TherapistOverview } from "@/components/dashboard/therapist/therapist-overview";
import { TherapistStats } from "@/components/dashboard/therapist/therapist-stats";
import { requireActiveTherapistFeatures } from "@/lib/permissions";
import { getTherapistDashboardData } from "@/server/services/dashboard.service";
import { getTherapistPublicProfile } from "@/server/services/therapist-public-profile.service";
import { TherapistPublicProfileForm } from "@/components/forms/therapist-public-profile-form";

export default async function TherapistDashboardPage() {
  const user = await requireActiveTherapistFeatures();
  const data = await getTherapistDashboardData(user.id);
  const publicProfile = await getTherapistPublicProfile(user.id);

  return (
    <>
      <TherapistOverview email={user.email} data={data} />
      <TherapistStats stats={data.stats} />
      {publicProfile && <TherapistPublicProfileForm profile={publicProfile} />}
    </>
  );
}
