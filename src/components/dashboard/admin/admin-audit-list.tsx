import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";
import type { AdminAuditLogItem } from "@/server/services/admin-operations.service";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getActorName(log: AdminAuditLogItem) {
  if (!log.actorUser) {
    return "System";
  }

  return [log.actorUser.firstName, log.actorUser.lastName].filter(Boolean).join(" ") || log.actorUser.email;
}

type AdminAuditListProps = {
  logs: AdminAuditLogItem[];
};

export function AdminAuditList({ logs }: AdminAuditListProps) {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Admin oversight</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Audit trail</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This list keeps a lightweight operational history of manual platform changes so the team can trace what happened, when, and by whom.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{logs.length}</span> audit event{logs.length === 1 ? "" : "s"}
        </div>
      </div>

      {logs.length ? (
        <div className="mt-6 grid gap-4">
          {logs.map((log) => (
            <article key={log.id} className="rounded-[1.75rem] border border-slate-200/70 bg-white/70 p-5 shadow-sm shadow-slate-950/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{log.entityType}</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">{log.action.replaceAll("_", " ")}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Entity ID: {log.entityId}</p>
                </div>
                <div className="text-sm text-slate-600 sm:text-right">
                  <p className="font-medium text-slate-900">{getActorName(log)}</p>
                  <p className="mt-1">{formatDateTime(log.createdAt)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
                  <p className="text-sm font-medium text-slate-700">Before</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{JSON.stringify(log.before, null, 2) || "null"}</pre>
                </div>
                <div className="rounded-[1.25rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3">
                  <p className="text-sm font-medium text-slate-700">After</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{JSON.stringify(log.after, null, 2) || "null"}</pre>
                </div>
              </div>
            </article>
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
    </section>
  );
}
