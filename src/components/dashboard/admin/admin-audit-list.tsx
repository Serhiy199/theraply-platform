import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import type { AdminAuditLogItem } from "@/server/services/admin-operations.service";
import { formatAppDateTime } from "@/lib/utils/date-time";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

function formatDateTime(date: Date) {
  return formatAppDateTime(date);
}

function getActorName(log: AdminAuditLogItem) {
  if (!log.actorUser) {
    return "System";
  }

  return (
    [log.actorUser.firstName, log.actorUser.lastName].filter(Boolean).join(" ") ||
    log.actorUser.email
  );
}

type AdminAuditListProps = {
  logs: AdminAuditLogItem[];
};

export function AdminAuditList({ logs }: AdminAuditListProps) {
  return (
    <SurfaceCard as="section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Admin oversight</SectionEyebrow>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Audit trail</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This list keeps a lightweight operational history of manual platform changes so
            the team can trace what happened, when, and by whom.
          </p>
        </div>
        <InsetCard as="div" tone="plain" className="px-4 py-3 shadow-none">
          <span className="font-semibold text-slate-900">{logs.length}</span> audit
          event{logs.length === 1 ? "" : "s"}
        </InsetCard>
      </div>

      {logs.length ? (
        <div className="mt-6 grid gap-4">
          {logs.map((log) => (
            <InsetCard key={log.id} as="article" tone="soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {log.entityType}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">
                    {log.action.replaceAll("_", " ")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Entity ID: {log.entityId}
                  </p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p className="font-medium text-slate-900">{getActorName(log)}</p>
                  <p className="mt-1">{formatDateTime(log.createdAt)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
                  <p className="text-sm font-medium text-slate-700">Before</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                    {JSON.stringify(log.before, null, 2) || "null"}
                  </pre>
                </InsetCard>
                <InsetCard as="div" tone="muted" className="rounded-[1.25rem] px-4 py-3 shadow-none">
                  <p className="text-sm font-medium text-slate-700">After</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                    {JSON.stringify(log.after, null, 2) || "null"}
                  </pre>
                </InsetCard>
              </div>
            </InsetCard>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <DashboardEmptyState
            meta="Admin oversight"
            title="No audit events yet"
            description="Manual admin actions will appear here once platform interventions begin generating audit records."
          />
        </div>
      )}
    </SurfaceCard>
  );
}
