import { TherapistRequestsOverview } from "@/components/dashboard/therapist/therapist-requests-overview";
import { requireActiveTherapistFeatures } from "@/lib/permissions";
import {
  getTherapistPastSessions,
  getTherapistPendingRequests,
  getTherapistUpcomingSessions,
} from "@/server/services/therapist-bookings.service";

export default async function TherapistRequestsPage() {
  const user = await requireActiveTherapistFeatures();
  const [pendingRequests, upcomingSessions, pastSessions] = await Promise.all([
    getTherapistPendingRequests(user.id),
    getTherapistUpcomingSessions(user.id),
    getTherapistPastSessions(user.id),
  ]);

  return (
    <TherapistRequestsOverview
      pendingRequests={pendingRequests}
      upcomingSessions={upcomingSessions}
      pastSessions={pastSessions}
    />
  );
}
