import { UserRole } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { dashboardAreaMeta, dashboardNavByRole } from "@/lib/constants/dashboard-nav";
import { requireRole } from "@/lib/permissions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireRole([UserRole.ADMIN]);
  const meta = dashboardAreaMeta.ADMIN;

  return (
    <DashboardShell
      roleLabel="Admin"
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      navigationItems={dashboardNavByRole.ADMIN}
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
