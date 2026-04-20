import Link from "next/link";
import type { TherapistListItem } from "@/lib/contracts/booking-flow";

function getDisplayName(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.displayName ||
    [therapist.firstName, therapist.lastName].filter(Boolean).join(" ") ||
    therapist.email
  );
}

type TherapistCardProps = {
  therapist: TherapistListItem;
};

export function TherapistCard({ therapist }: TherapistCardProps) {
  const hasCalendarConnection = Boolean(
    therapist.therapistProfile?.isGoogleCalendarConnected &&
      therapist.therapistProfile?.googleCalendarId,
  );

  return (
    <article className="soft-card flex h-full flex-col rounded-[1.75rem] border border-slate-200/70 p-5 shadow-sm shadow-slate-950/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Approved therapist</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">{getDisplayName(therapist)}</h3>
          <p className="mt-2 text-sm text-slate-600">{therapist.email}</p>
        </div>
        <span
          className={[
            "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
            hasCalendarConnection
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-amber-200 bg-amber-50 text-amber-800",
          ].join(" ")}
        >
          {hasCalendarConnection ? "Calendar ready" : "Calendar setup pending"}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 text-sm text-slate-600">
        <div>
          <dt className="font-medium text-slate-700">Specialization</dt>
          <dd className="mt-1">{therapist.therapistProfile?.specialization ?? "To be defined"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Profile summary</dt>
          <dd className="mt-1 leading-6">{therapist.therapistProfile?.bio ?? "Profile details will expand as therapist onboarding continues."}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Calendar connection</dt>
          <dd className="mt-1">
            {therapist.therapistProfile?.googleCalendarEmail ??
              "Calendar sync will be shown once connected."}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-1 items-end">
        <Link
          href={`/client/book/${therapist.id}`}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          View available slots
        </Link>
      </div>
    </article>
  );
}
