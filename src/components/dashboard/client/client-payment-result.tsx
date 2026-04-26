import Link from "next/link";

type ClientPaymentResultProps = {
  tone: "success" | "warning";
  meta: string;
  title: string;
  description: string;
  bookingHref?: string | null;
  bookingLabel?: string;
  sessionId?: string | null;
  extraNote?: string | null;
};

const toneClasses = {
  success: {
    shell: "border-emerald-200/80 bg-emerald-50/70",
    badge: "border-emerald-200 bg-white text-emerald-800",
    title: "text-emerald-950",
  },
  warning: {
    shell: "border-amber-200/80 bg-amber-50/70",
    badge: "border-amber-200 bg-white text-amber-800",
    title: "text-amber-950",
  },
} as const;

export function ClientPaymentResult({
  tone,
  meta,
  title,
  description,
  bookingHref,
  bookingLabel = "Return to booking",
  sessionId,
  extraNote,
}: ClientPaymentResultProps) {
  const palette = toneClasses[tone];

  return (
    <section
      className={`soft-card rounded-[2rem] border p-6 md:p-8 ${palette.shell}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Client billing
          </p>
          <h2 className={`mt-3 text-3xl font-semibold ${palette.title}`}>{title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
            {description}
          </p>
        </div>
        <div
          className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${palette.badge}`}
        >
          {meta}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/80 p-5 shadow-sm shadow-slate-950/5">
          <h3 className="text-lg font-semibold text-slate-900">What happens next</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">{extraNote}</p>
          {sessionId ? (
            <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              Stripe session ID: <span className="font-medium text-slate-900">{sessionId}</span>
            </div>
          ) : null}
        </article>

        <article className="rounded-[1.75rem] border border-slate-200/70 bg-white/80 p-5 shadow-sm shadow-slate-950/5">
          <h3 className="text-lg font-semibold text-slate-900">Quick links</h3>
          <div className="mt-4 grid gap-3">
            {bookingHref ? (
              <Link
                href={bookingHref}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {bookingLabel}
              </Link>
            ) : null}
            <Link
              href="/client/payments"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              View payment history
            </Link>
            <Link
              href="/client/bookings"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Back to bookings
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
