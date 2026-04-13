import { UserRole } from "@prisma/client";
import { TherapistPicker } from "@/components/booking/client/therapist-picker";
import { requireRole } from "@/lib/permissions";
import { getBookableTherapists } from "@/server/services/booking-flow.service";

export default async function ClientTherapistBookingEntryPage() {
  await requireRole([UserRole.CLIENT]);
  const therapists = await getBookableTherapists();

  return <TherapistPicker therapists={therapists} />;
}
