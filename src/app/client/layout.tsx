import { UserRole } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { dashboardAreaMeta, dashboardNavByRole } from "@/lib/constants/dashboard-nav";
import { requireRole } from "@/lib/permissions";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const user = await requireRole([UserRole.CLIENT]);
  const meta = dashboardAreaMeta.CLIENT;

  return (
    <DashboardShell
      roleLabel="Client"
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      navigationItems={dashboardNavByRole.CLIENT}
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
