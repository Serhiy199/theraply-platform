import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { TherapistAvailability } from "@/components/booking/client/therapist-availability";
import { getSafeGoogleAvailabilityErrorMessage } from "@/lib/errors/safe-error-messages";
import { requireRole } from "@/lib/permissions";
import { GoogleAvailabilityServiceError } from "@/server/services/google-availability.service";
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
  let availabilityIssue: string | undefined;
  let slots: Awaited<ReturnType<typeof getTherapistAvailability>> = [];

  try {
    slots = await getTherapistAvailability(therapistId);
  } catch (error) {
    if (error instanceof BookingFlowServiceError && error.code === "THERAPIST_NOT_BOOKABLE") {
      notFound();
    }

    if (error instanceof GoogleAvailabilityServiceError) {
      availabilityIssue = getSafeGoogleAvailabilityErrorMessage(error.code);
    } else {
      throw error;
    }
  }

  const therapist = await getBookableTherapistById(therapistId);
  return (
    <TherapistAvailability
      therapist={therapist}
      slots={slots}
      availabilityIssue={availabilityIssue}
    />
  );
}
