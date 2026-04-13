export default function AdminLoading() {
  return (
    <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Admin area</p>
      <h2 className="mt-3 text-3xl font-semibold text-slate-900">Loading workspace</h2>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div className="h-40 animate-pulse rounded-[1.75rem] border border-slate-200/70 bg-slate-100/80" />
        <div className="h-40 animate-pulse rounded-[1.75rem] border border-slate-200/70 bg-slate-100/80" />
      </div>
    </section>
  );
}
