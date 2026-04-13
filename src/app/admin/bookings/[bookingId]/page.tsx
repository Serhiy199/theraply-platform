import { notFound } from "next/navigation";
import { UserRole } from "@prisma/client";
import { AdminBookingDetails } from "@/components/dashboard/admin/admin-booking-details";
import { requireRole } from "@/lib/permissions";
import { getAdminBookingById } from "@/server/services/admin-operations.service";

type AdminBookingDetailsPageProps = {
  params: Promise<{
    bookingId: string;
  }>;
};

export default async function AdminBookingDetailsPage({ params }: AdminBookingDetailsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const { bookingId } = await params;
  const booking = await getAdminBookingById(bookingId);

  if (!booking) {
    notFound();
  }

  return <AdminBookingDetails booking={booking} />;
}
