import { UserRole } from "@prisma/client";
import { Card, Space } from "antd";
import { requireRole } from "@/lib/permissions";

export default async function AdminDashboardPage() {
  const user = await requireRole([UserRole.ADMIN]);

  return (
    <main className="site-shell mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16 md:px-10">
      <Card className="soft-card w-full max-w-3xl" bordered={false}>
        <Space direction="vertical" size="large" className="w-full">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Admin area
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">Admin Dashboard</h1>
            <p className="mt-3 text-base text-slate-600">
              Signed in as {user.email}. This protected area will become the operational console for
              users, bookings, therapists, and payment oversight.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-slate-200/70 bg-white/60 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Platform monitoring</h2>
              <p className="mt-2 text-sm text-slate-600">
                Booking activity, audit logs, and email delivery checks will surface here.
              </p>
            </section>
            <section className="rounded-3xl border border-slate-200/70 bg-white/60 p-5">
              <h2 className="text-lg font-semibold text-slate-900">Management tools</h2>
              <p className="mt-2 text-sm text-slate-600">
                Therapist approvals, payout details, and manual booking actions will be added next.
              </p>
            </section>
          </div>
        </Space>
      </Card>
    </main>
  );
}
