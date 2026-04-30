import type { ReactNode } from "react";

type AlertTone = "info" | "success" | "warning" | "error";

const toneClasses: Record<AlertTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

type AlertProps = {
  tone?: AlertTone;
  title?: string;
  className?: string;
  children: ReactNode;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Alert({
  tone = "info",
  title,
  className,
  children,
}: AlertProps) {
  return (
    <div
      className={joinClasses(
        "rounded-[1.25rem] border px-4 py-3 text-sm",
        toneClasses[tone],
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export type { AlertProps, AlertTone };
