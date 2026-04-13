import { UserRole } from "@prisma/client";
import { AdminBookingsTable } from "@/components/dashboard/admin/admin-bookings-table";
import { requireRole } from "@/lib/permissions";
import { getAdminBookings } from "@/server/services/admin-operations.service";

export default async function AdminBookingsPage() {
  await requireRole([UserRole.ADMIN]);
  const bookings = await getAdminBookings();

  return <AdminBookingsTable bookings={bookings} />;
}
