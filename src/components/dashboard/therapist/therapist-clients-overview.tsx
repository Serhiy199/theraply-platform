import type { TherapistClientListItem } from "@/server/services/therapist-bookings.service";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function getClientName(client: TherapistClientListItem) {
  return [client.firstName, client.lastName].filter(Boolean).join(" ") || client.email;
}

type TherapistClientsOverviewProps = {
  clients: TherapistClientListItem[];
};

export function TherapistClientsOverview({ clients }: TherapistClientsOverviewProps) {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Therapist relationships</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Clients</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This list gives the therapist a compact view of active client relationships, booking depth, and the most recent contact point.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{clients.length}</span> client relationship{clients.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {clients.length ? clients.map((client) => (
          <article key={client.clientId} className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{getClientName(client)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{client.email}</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                {client.upcomingBookings} upcoming
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
                <p className="font-medium text-slate-700">Total bookings</p>
                <p className="mt-1">{client.totalBookings}</p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
                <p className="font-medium text-slate-700">First booking</p>
                <p className="mt-1">{formatDate(client.firstBookingAt)}</p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
                <p className="font-medium text-slate-700">Latest activity</p>
                <p className="mt-1">{formatDate(client.latestBookingAt)}</p>
              </div>
            </div>
          </article>
        )) : (
          <article className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/50 p-6 text-sm leading-6 text-slate-600">
            <h3 className="text-lg font-semibold text-slate-900">No client relationships yet</h3>
            <p className="mt-2">Clients will appear here automatically as soon as bookings start connecting them to this therapist profile.</p>
          </article>
        )}
      </div>
    </section>
  );
}
