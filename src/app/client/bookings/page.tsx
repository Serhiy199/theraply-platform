import { UserRole } from "@prisma/client";
import { ClientBookingsOverview } from "@/components/dashboard/client/client-bookings-overview";
import { requireRole } from "@/lib/permissions";
import {
  getClientPastBookings,
  getClientUpcomingBookings,
} from "@/server/services/client-bookings.service";

export default async function ClientBookingsPage() {
  const user = await requireRole([UserRole.CLIENT]);
  const [upcomingBookings, pastBookings] = await Promise.all([
    getClientUpcomingBookings(user.id),
    getClientPastBookings(user.id),
  ]);

  return <ClientBookingsOverview upcomingBookings={upcomingBookings} pastBookings={pastBookings} />;
}
