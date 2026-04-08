import { DashboardPlaceholderPage } from "@/components/dashboard/dashboard-placeholder-page";

export default function AdminUsersPage() {
  return (
    <DashboardPlaceholderPage
      eyebrow="Admin oversight"
      title="Users"
      description="This section will become the central user directory for client accounts, status checks, and lifecycle management."
    >
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Client directory</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Searchable client records and account state will be added here.
        </p>
      </article>
      <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/60 p-5">
        <h3 className="text-lg font-semibold text-slate-900">Access control</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Future account flags, activation state, and issue handling will be surfaced here.
        </p>
      </article>
    </DashboardPlaceholderPage>
  );
}
