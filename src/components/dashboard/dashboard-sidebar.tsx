"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DashboardNavItem } from "@/lib/constants/dashboard-nav";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { getUserDisplayName, getUserInitials } from "@/lib/auth/session";

type DashboardSidebarProps = {
  eyebrow: string;
  title: string;
  description: string;
  roleLabel: string;
  items: DashboardNavItem[];
  user: {
    email?: string | null;
    firstName?: string;
    lastName?: string;
  };
};

function isActivePath(pathname: string, href: string) {
  if (href === pathname) {
    return true;
  }

  return href !== "/" && pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({
  eyebrow,
  title,
  description,
  roleLabel,
  items,
  user,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  return (
    <aside className="soft-card h-fit rounded-[2rem] border border-slate-200/70 p-6 lg:sticky lg:top-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <section className="mt-8 rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="truncate text-sm text-slate-600">{user.email ?? "No email provided"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
            {roleLabel}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Active
          </span>
        </div>
      </section>

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

      <div className="mt-8">
        <LogoutButton block size="middle" />
      </div>
    </aside>
  );
}
