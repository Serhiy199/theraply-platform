import type { ReactNode } from "react";
import { SectionEyebrow, SurfaceCard } from "@/components/ui/card";

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
    <SurfaceCard as="section">
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h2 className="mt-3 text-3xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{description}</p>
      {children ? <div className="mt-6 grid gap-4 xl:grid-cols-2">{children}</div> : null}
    </SurfaceCard>
  );
}
