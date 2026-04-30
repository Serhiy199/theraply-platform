import { LogoutButton } from "@/components/dashboard/logout-button";
import { getUserDisplayName } from "@/lib/auth/user-display";
import { Badge } from "@/components/ui/badge";

type DashboardHeaderProps = {
  email: string | null | undefined;
  firstName?: string;
  lastName?: string;
  roleLabel: string;
};

export function DashboardHeader({ email, firstName, lastName, roleLabel }: DashboardHeaderProps) {
  const displayName = getUserDisplayName({ email, firstName, lastName });

  return (
    <header className="soft-card rounded-[2rem] border border-slate-200/70 p-5 md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Signed in</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900 md:text-3xl">{displayName}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {roleLabel} access is active.
            {email ? ` Current account: ${email}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="white" size="sm">{roleLabel}</Badge>
          <Badge variant="success" size="sm">Session active</Badge>
          <LogoutButton size="large" />
        </div>
      </div>
    </header>
  );
}
