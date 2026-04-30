import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type SurfaceCardProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children: ReactNode;
  padded?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function SurfaceCard<T extends ElementType = "section">({
  as,
  className,
  children,
  padded = true,
  ...props
}: SurfaceCardProps<T>) {
  const Component = as ?? "section";

  return (
    <Component
      className={joinClasses(
        "soft-card rounded-[2rem] border border-slate-200/70",
        padded && "p-6 md:p-8",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

type InsetCardTone = "soft" | "plain" | "elevated" | "muted" | "empty";

const insetToneClasses: Record<InsetCardTone, string> = {
  soft: "bg-white/70 shadow-sm shadow-slate-950/5",
  plain: "bg-white/60",
  elevated: "bg-white/80 shadow-sm shadow-slate-950/5",
  muted: "bg-slate-50/70",
  empty: "border-dashed border-slate-300 bg-white/50",
};

type InsetCardProps<T extends ElementType> = {
  as?: T;
  tone?: InsetCardTone;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function InsetCard<T extends ElementType = "article">({
  as,
  tone = "plain",
  className,
  children,
  ...props
}: InsetCardProps<T>) {
  const Component = as ?? "article";

  return (
    <Component
      className={joinClasses(
        "rounded-[1.75rem] border border-slate-200/70 p-5",
        insetToneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

type SectionEyebrowProps = {
  children: ReactNode;
  className?: string;
};

export function SectionEyebrow({ children, className }: SectionEyebrowProps) {
  return (
    <p
      className={joinClasses(
        "text-sm font-semibold uppercase tracking-[0.2em] text-slate-500",
        className,
      )}
    >
      {children}
    </p>
  );
}

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint: string;
  className?: string;
};

export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <InsetCard tone="plain" className={className}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-4 text-4xl font-semibold text-slate-900">{value}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{hint}</p>
    </InsetCard>
  );
}
