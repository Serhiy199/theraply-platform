import { UserRole } from "@prisma/client";
import { ClientPaymentsOverview } from "@/components/dashboard/client/client-payments-overview";
import { requireRole } from "@/lib/permissions";
import { getClientPayments } from "@/server/services/client-bookings.service";
import { getClientCreditSummary } from "@/server/services/client-credit.service";

export default async function ClientPaymentsPage() {
  const user = await requireRole([UserRole.CLIENT]);
  const [payments, creditSummary] = await Promise.all([
    getClientPayments(user.id),
    getClientCreditSummary(user.id),
  ]);

  return <ClientPaymentsOverview payments={payments} creditSummary={creditSummary} />;
}
