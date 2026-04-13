import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { TherapistAvailability } from "@/components/booking/client/therapist-availability";
import { requireRole } from "@/lib/permissions";
import {
  BookingFlowServiceError,
  getBookableTherapistById,
  getTherapistAvailability,
} from "@/server/services/booking-flow.service";

type ClientTherapistAvailabilityPageProps = {
  params: Promise<{
    therapistId: string;
  }>;
};

export default async function ClientTherapistAvailabilityPage({ params }: ClientTherapistAvailabilityPageProps) {
  await requireRole([UserRole.CLIENT]);
  const { therapistId } = await params;

  try {
    const [therapist, slots] = await Promise.all([
      getBookableTherapistById(therapistId),
      getTherapistAvailability(therapistId),
    ]);

    return <TherapistAvailability therapist={therapist} slots={slots} />;
  } catch (error) {
    if (error instanceof BookingFlowServiceError && error.code === "THERAPIST_NOT_BOOKABLE") {
      notFound();
    }

    throw error;
  }
}