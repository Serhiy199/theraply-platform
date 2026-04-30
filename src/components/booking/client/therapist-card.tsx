import type { TherapistListItem } from "@/lib/contracts/booking-flow";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard } from "@/components/ui/card";

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

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "Price will be confirmed later";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value / 100);
}

export function TherapistCard({ therapist }: TherapistCardProps) {
  const hasCalendarConnection = Boolean(
    therapist.therapistProfile?.isGoogleCalendarConnected &&
      therapist.therapistProfile?.googleCalendarId,
  );

  return (
    <InsetCard as="article" tone="soft" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Approved therapist
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">
            {getDisplayName(therapist)}
          </h3>
          <p className="mt-2 text-sm text-slate-600">{therapist.email}</p>
        </div>
        <Badge variant={hasCalendarConnection ? "success" : "warning"}>
          {hasCalendarConnection ? "Calendar ready" : "Calendar setup pending"}
        </Badge>
      </div>

      <dl className="mt-5 grid gap-4 text-sm text-slate-600">
        <div>
          <dt className="font-medium text-slate-700">Specialization</dt>
          <dd className="mt-1">
            {therapist.therapistProfile?.specialization ?? "To be defined"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Session price</dt>
          <dd className="mt-1">
            {formatCurrency(therapist.therapistProfile?.sessionPricePence)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-700">Profile summary</dt>
          <dd className="mt-1 leading-6">
            {therapist.therapistProfile?.bio ??
              "Profile details will expand as therapist onboarding continues."}
          </dd>
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
        <ButtonLink href={`/client/book/${therapist.id}`} variant="secondary">
          View available slots
        </ButtonLink>
      </div>
    </InsetCard>
  );
}
