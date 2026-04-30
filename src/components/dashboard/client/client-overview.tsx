import Link from "next/link";
import type { getClientDashboardData } from "@/server/services/dashboard.service";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

type ClientDashboardData = Awaited<ReturnType<typeof getClientDashboardData>>;

type ClientOverviewProps = {
  email?: string | null;
  data: ClientDashboardData;
};

function formatDate(date: Date | null) {
  if (!date) return "Not available yet";

  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ClientOverview({ email, data }: ClientOverviewProps) {
  const upcomingSessions = data.stats.find((item) => item.label === "Upcoming sessions")?.value ?? 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <SurfaceCard>
        <SectionEyebrow>Dashboard overview</SectionEyebrow>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Client Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          This view now feels like a real product workspace: account summary, payment readiness,
          quick actions, and the next booking touchpoints all live in one place.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/client/book/new">
            Book a session
          </ButtonLink>
          <ButtonLink href="/client/bookings" variant="secondary">
            Open bookings
          </ButtonLink>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <InsetCard tone="plain">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Upcoming sessions
            </p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{upcomingSessions}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {data.recentBookings.length
                ? "Your latest booking activity is shown below so you can keep momentum."
                : "No future sessions yet. As soon as booking flows go live, your next confirmed sessions will appear here."}
            </p>
          </InsetCard>

          <InsetCard tone="plain">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Payment summary
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{data.paymentSummary.message}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {data.paymentSummary.healthy
                ? "Billing is currently clear for this account."
                : "Use the payments area to resolve outstanding items before sessions are confirmed."}
            </p>
          </InsetCard>
        </div>
      </SurfaceCard>

      <div className="grid gap-4">
        <SurfaceCard className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">Quick actions</h3>
          <div className="mt-5 grid gap-3">
            {data.quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
              >
                <span className="block text-sm font-semibold text-slate-900">{action.label}</span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">{action.description}</span>
              </Link>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">Account summary</h3>
          <dl className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Client profile</dt>
              <dd className="text-right">{data.accountSummary.displayName ?? "Profile pending"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Email</dt>
              <dd className="text-right">{data.accountSummary.email ?? email ?? "Unknown"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Member since</dt>
              <dd className="text-right">{formatDate(data.accountSummary.memberSince)}</dd>
            </div>
          </dl>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-6 xl:col-span-2">
        <h3 className="text-xl font-semibold text-slate-900">Recent booking activity</h3>
        {data.recentBookings.length ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {data.recentBookings.map((booking) => (
              <InsetCard key={booking.id} tone="plain" className="rounded-[1.5rem] p-4 shadow-none">
                <p className="text-sm font-semibold text-slate-900">{booking.therapistName}</p>
                <p className="mt-1 text-sm text-slate-600">{formatDateTime(booking.startsAt)}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {booking.status.replaceAll("_", " ")}
                </p>
              </InsetCard>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-slate-600">
            No booking records yet. Once booking flows are connected, this panel will show the next
            therapist sessions and the latest booking status changes.
          </p>
        )}
      </SurfaceCard>
    </div>
  );
}
