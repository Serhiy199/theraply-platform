import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "white";

type BadgeSize = "xs" | "sm";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getVariantClasses(variant: BadgeVariant) {
  switch (variant) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "info":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "white":
      return "border-slate-200/70 bg-white text-slate-700";
    case "neutral":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getSizeClasses(size: BadgeSize) {
  switch (size) {
    case "sm":
      return "px-4 py-2 text-sm font-medium";
    case "xs":
    default:
      return "px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]";
  }
}

export function Badge({
  variant = "neutral",
  size = "xs",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={joinClasses(
        "inline-flex rounded-full border",
        getSizeClasses(size),
        getVariantClasses(variant),
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
