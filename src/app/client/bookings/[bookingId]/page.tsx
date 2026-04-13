import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ClientBookingDetails } from "@/components/dashboard/client/client-booking-details";
import { requireRole } from "@/lib/permissions";
import { getClientBookingById } from "@/server/services/client-bookings.service";

type ClientBookingDetailsPageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export default async function ClientBookingDetailsPage({ params }: ClientBookingDetailsPageProps) {
  const user = await requireRole([UserRole.CLIENT]);
  const { bookingId } = await params;
  const booking = await getClientBookingById(user.id, bookingId);

  if (!booking) {
    notFound();
  }

  return <ClientBookingDetails booking={booking} />;
}
