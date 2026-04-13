import { UserRole } from "@prisma/client";
import { TherapistPayoutForm } from "@/components/dashboard/therapist/therapist-payout-form";
import { requireRole } from "@/lib/permissions";
import { getTherapistPayoutDetails } from "@/server/services/therapist-bookings.service";

export default async function TherapistPayoutDetailsPage() {
  const user = await requireRole([UserRole.THERAPIST]);
  const data = await getTherapistPayoutDetails(user.id);

  return <TherapistPayoutForm data={data} />;
}
