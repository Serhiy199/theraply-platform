import { UserRole } from "@prisma/client";
import { TherapistClientsOverview } from "@/components/dashboard/therapist/therapist-clients-overview";
import { requireRole } from "@/lib/permissions";
import { getTherapistClients } from "@/server/services/therapist-bookings.service";

export default async function TherapistClientsPage() {
  const user = await requireRole([UserRole.THERAPIST]);
  const clients = await getTherapistClients(user.id);

  return <TherapistClientsOverview clients={clients} />;
}
