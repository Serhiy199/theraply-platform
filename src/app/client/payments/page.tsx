import { UserRole } from "@prisma/client";
import { ClientPaymentsOverview } from "@/components/dashboard/client/client-payments-overview";
import { requireRole } from "@/lib/permissions";
import { getClientPayments } from "@/server/services/client-bookings.service";

export default async function ClientPaymentsPage() {
  const user = await requireRole([UserRole.CLIENT]);
  const payments = await getClientPayments(user.id);

  return <ClientPaymentsOverview payments={payments} />;
}
