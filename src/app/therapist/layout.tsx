import { UserRole } from "@prisma/client";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { dashboardAreaMeta, dashboardNavByRole } from "@/lib/constants/dashboard-nav";
import { requireRole } from "@/lib/permissions";

export default async function TherapistLayout({ children }: LayoutProps<"/therapist">) {
  const user = await requireRole([UserRole.THERAPIST]);
  const meta = dashboardAreaMeta.THERAPIST;

  return (
    <DashboardShell
      roleLabel="Therapist"
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={meta.description}
      navigationItems={dashboardNavByRole.THERAPIST}
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
