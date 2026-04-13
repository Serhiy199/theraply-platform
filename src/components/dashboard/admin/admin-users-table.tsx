import type { AdminUserListItem } from "@/server/services/admin-operations.service";
import { DashboardEmptyState } from "@/components/dashboard/shared/dashboard-empty-state";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function getUserDisplayName(user: AdminUserListItem) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

type AdminUsersTableProps = {
  users: AdminUserListItem[];
};

export function AdminUsersTable({ users }: AdminUsersTableProps) {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Admin oversight</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Clients</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
            This directory gives the operations team a clean view of client accounts, activation state, and account creation flow across the platform.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/60 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{users.length}</span> client account{users.length === 1 ? "" : "s"}
        </div>
      </div>

      {users.length ? (
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-slate-200/70 bg-white/70">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Client</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Created</th>
                <th className="px-5 py-4">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{getUserDisplayName(user)}</p>
                    <p className="mt-1 text-slate-600">{user.email}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">ID {user.id}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${user.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-700"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(user.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <DashboardEmptyState meta="Admin users" title="No client accounts yet" description="Client registrations will appear here once account activity starts flowing into the platform." />}
    </section>
  );
}
