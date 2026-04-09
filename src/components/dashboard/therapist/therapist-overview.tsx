import type { getTherapistDashboardData } from "@/server/services/dashboard.service";

type TherapistDashboardData = Awaited<ReturnType<typeof getTherapistDashboardData>>;

type TherapistOverviewProps = {
  email?: string | null;
  data: TherapistDashboardData;
};

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatValue(data: TherapistDashboardData, label: string) {
  return data.stats.find((item) => item.label === label)?.value ?? 0;
}

export function TherapistOverview({ email, data }: TherapistOverviewProps) {
  const pendingRequests = getStatValue(data, "Pending requests");
  const upcomingSessions = getStatValue(data, "Upcoming sessions");
  const clientRelationships = getStatValue(data, "Client relationships");

  const profileChecks = [
    {
      label: "Display profile name",
      complete: Boolean(data.profileSummary.displayName),
    },
    {
      label: "Add specialization",
      complete: Boolean(data.profileSummary.specialization),
    },
    {
      label: "Connect Google Calendar",
      complete: Boolean(data.profileSummary.calendarEmail),
    },
    {
      label: "Set payout country",
      complete: Boolean(data.profileSummary.payoutCountry),
    },
  ];

  const completedChecks = profileChecks.filter((item) => item.complete).length;
  const completionPercent = Math.round((completedChecks / profileChecks.length) * 100);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Dashboard overview
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Therapist Dashboard</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          This workspace gives therapists a real operational starting point: pending requests,
          upcoming sessions, client relationships, and readiness for calendar and payout workflows.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Pending requests
            </p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{pendingRequests}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {Number(pendingRequests) > 0
                ? "Clients are waiting for your review, so this queue becomes your top priority area."
                : "No pending confirmations right now. New client booking requests will appear here first."}
            </p>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Upcoming sessions
            </p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{upcomingSessions}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Confirmed sessions will stack here so you can quickly sense your upcoming workload.
            </p>
          </article>
        </div>
      </section>

      <div className="grid gap-4">
        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Client summary</h3>
          <dl className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Therapist profile</dt>
              <dd className="text-right">{data.profileSummary.displayName ?? email ?? "Pending"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Specialization</dt>
              <dd className="text-right">{data.profileSummary.specialization ?? "Not added yet"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Client relationships</dt>
              <dd className="text-right">{clientRelationships}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Approval status</dt>
              <dd className="text-right">{data.profileSummary.approvalStatus ?? "Pending"}</dd>
            </div>
          </dl>
        </section>

        <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Payout / profile completion</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Finish the operational setup so bookings, calendar sync, and payouts can run smoothly.
              </p>
            </div>
            <div className="rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900">
              {completionPercent}%
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {profileChecks.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 rounded-[1.25rem] border border-slate-200/70 bg-white/60 px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    item.complete
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.complete ? "Complete" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 xl:col-span-2">
        <h3 className="text-xl font-semibold text-slate-900">Pending request queue</h3>
        {data.recentRequests.length ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {data.recentRequests.map((booking) => (
              <article
                key={booking.id}
                className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 p-4"
              >
                <p className="text-sm font-semibold text-slate-900">{booking.clientName}</p>
                <p className="mt-1 text-sm text-slate-600">{formatDateTime(booking.startsAt)}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {booking.status.replaceAll("_", " ")}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-slate-600">
            No pending requests yet. Once clients start booking, this queue will surface the most
            urgent items first.
          </p>
        )}
      </section>
    </div>
  );
}
