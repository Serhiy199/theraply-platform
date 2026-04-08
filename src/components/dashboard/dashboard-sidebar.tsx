"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DashboardNavItem } from "@/lib/constants/dashboard-nav";

type DashboardSidebarProps = {
  eyebrow: string;
  title: string;
  description: string;
  items: DashboardNavItem[];
};

function isActivePath(pathname: string, href: string) {
  if (href === pathname) {
    return true;
  }

  return href !== "/" && pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ eyebrow, title, description, items }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="soft-card h-fit rounded-[2rem] border border-slate-200/70 p-6 lg:sticky lg:top-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <nav className="mt-8 flex flex-col gap-3" aria-label="Dashboard navigation">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={[
                "rounded-3xl border px-4 py-4 transition",
                active
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/15"
                  : "border-slate-200/70 bg-white/60 text-slate-900 hover:border-slate-300 hover:bg-white",
              ].join(" ")}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span
                className={[
                  "mt-1 block text-sm leading-5",
                  active ? "text-slate-200" : "text-slate-600",
                ].join(" ")}
              >
                {item.description}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
