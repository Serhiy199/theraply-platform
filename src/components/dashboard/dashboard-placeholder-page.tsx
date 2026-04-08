import type { ReactNode } from "react";

type DashboardPlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function DashboardPlaceholderPage({
  eyebrow,
  title,
  description,
  children,
}: DashboardPlaceholderPageProps) {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{description}</p>
      {children ? <div className="mt-6 grid gap-4 xl:grid-cols-2">{children}</div> : null}
    </section>
  );
}
