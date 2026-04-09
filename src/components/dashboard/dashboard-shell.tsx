import type { ReactNode } from "react";
import type { DashboardNavItem } from "@/lib/constants/dashboard-nav";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

type DashboardShellProps = {
  children: ReactNode;
  roleLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  navigationItems: DashboardNavItem[];
  user: {
    email?: string | null;
    firstName?: string;
    lastName?: string;
  };
};

export function DashboardShell({
  children,
  roleLabel,
  eyebrow,
  title,
  description,
  navigationItems,
  user,
}: DashboardShellProps) {
  return (
    <main className="site-shell mx-auto min-h-screen w-full max-w-7xl px-6 py-8 md:px-10 lg:py-10">
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <DashboardSidebar
          eyebrow={eyebrow}
          title={title}
          description={description}
          roleLabel={roleLabel}
          items={navigationItems}
          user={user}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <DashboardHeader
            email={user.email}
            firstName={user.firstName}
            lastName={user.lastName}
            roleLabel={roleLabel}
          />
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
