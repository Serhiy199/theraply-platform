import { TherapistClientsOverview } from "@/components/dashboard/therapist/therapist-clients-overview";
import { requireActiveTherapistFeatures } from "@/lib/permissions";
import { getTherapistClients } from "@/server/services/therapist-bookings.service";

export default async function TherapistClientsPage() {
  const user = await requireActiveTherapistFeatures();
  const clients = await getTherapistClients(user.id);

  return <TherapistClientsOverview clients={clients} />;
}
