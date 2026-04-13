import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { TherapistBookingDetails } from "@/components/dashboard/therapist/therapist-booking-details";
import { requireRole } from "@/lib/permissions";
import { getTherapistBookingById } from "@/server/services/therapist-bookings.service";

type TherapistBookingDetailsPageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export default async function TherapistBookingDetailsPage({ params }: TherapistBookingDetailsPageProps) {
  const user = await requireRole([UserRole.THERAPIST]);
  const { bookingId } = await params;
  const booking = await getTherapistBookingById(user.id, bookingId);

  if (!booking) {
    notFound();
  }

  return <TherapistBookingDetails booking={booking} />;
}
