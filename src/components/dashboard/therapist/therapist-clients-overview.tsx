import type { TherapistClientListItem } from "@/server/services/therapist-bookings.service";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import { Badge } from "@/components/ui/badge";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

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
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Therapist relationships</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Clients</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This list gives the therapist a compact view of active client relationships,
            booking depth, and the most recent contact point.
          </p>
        </div>
        <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
          <span className="font-semibold text-slate-900">{clients.length}</span> client
          relationship{clients.length === 1 ? "" : "s"}
        </InsetCard>
      </div>

      <div className="mt-6 grid gap-4">
        {clients.length ? (
          clients.map((client) => (
            <InsetCard key={client.clientId} as="article" tone="soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    {getClientName(client)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{client.email}</p>
                </div>
                <Badge variant="neutral">{client.upcomingBookings} upcoming</Badge>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
                  <p className="font-medium text-slate-700">Total bookings</p>
                  <p className="mt-1">{client.totalBookings}</p>
                </InsetCard>
                <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
                  <p className="font-medium text-slate-700">First booking</p>
                  <p className="mt-1">{formatDate(client.firstBookingAt)}</p>
                </InsetCard>
                <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
                  <p className="font-medium text-slate-700">Latest activity</p>
                  <p className="mt-1">{formatDate(client.latestBookingAt)}</p>
                </InsetCard>
              </div>
            </InsetCard>
          ))
        ) : (
          <DashboardEmptyState
            meta="Therapist clients"
            title="No client relationships yet"
            description="Clients will appear here automatically as soon as bookings start connecting them to this therapist profile."
          />
        )}
      </div>
    </SurfaceCard>
  );
}
