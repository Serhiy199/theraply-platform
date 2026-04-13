import type { ReactNode } from "react";

type DashboardEmptyStateProps = {
  title: string;
  description: string;
  meta?: string;
  action?: ReactNode;
};

export function DashboardEmptyState({ title, description, meta, action }: DashboardEmptyStateProps) {
  return (
    <article className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/50 p-6 text-sm leading-6 text-slate-600">
      {meta ? (
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{meta}</p>
      ) : null}
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </article>
  );
}
