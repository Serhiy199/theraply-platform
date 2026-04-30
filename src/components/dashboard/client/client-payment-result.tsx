import { ButtonLink } from "@/components/ui/button";
import { InsetCard, SectionEyebrow, SurfaceCard } from "@/components/ui/card";

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
    <SurfaceCard
      className={palette.shell}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <SectionEyebrow>Client billing</SectionEyebrow>
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
        <InsetCard tone="elevated">
          <h3 className="text-lg font-semibold text-slate-900">What happens next</h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">{extraNote}</p>
          {sessionId ? (
            <div className="mt-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              Stripe session ID: <span className="font-medium text-slate-900">{sessionId}</span>
            </div>
          ) : null}
        </InsetCard>

        <InsetCard tone="elevated">
          <h3 className="text-lg font-semibold text-slate-900">Quick links</h3>
          <div className="mt-4 grid gap-3">
            {bookingHref ? (
              <ButtonLink href={bookingHref}>
                {bookingLabel}
              </ButtonLink>
            ) : null}
            <ButtonLink href="/client/payments" variant="secondary">
              View payment history
            </ButtonLink>
            <ButtonLink href="/client/bookings" variant="secondary">
              Back to bookings
            </ButtonLink>
          </div>
        </InsetCard>
      </div>
    </SurfaceCard>
  );
}
