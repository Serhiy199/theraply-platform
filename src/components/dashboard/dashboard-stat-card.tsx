import type { ReactNode } from "react";

type DashboardStatCardProps = {
  label: string;
  value: ReactNode;
  hint: string;
};

export function DashboardStatCard({ label, value, hint }: DashboardStatCardProps) {
  return (
    <article className="soft-card rounded-[1.75rem] border border-slate-200/70 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold text-slate-900">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{hint}</p>
    </article>
  );
}
