"use client";

import { useState } from "react";
import { formatSessionPricePerHour, formatYearsOfExperience } from "@/lib/therapist-display";
import type { TherapistListItem } from "@/lib/contracts/booking-flow";
import { TherapistProfilePhoto } from "@/components/booking/client/therapist-profile-photo";
import { ButtonLink } from "@/components/ui/button";
import { InsetCard } from "@/components/ui/card";

function getDisplayName(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.displayName ||
    [therapist.firstName, therapist.lastName].filter(Boolean).join(" ") ||
    "Therapist"
  );
}

function getSpecialisation(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.specialisation ||
    therapist.therapistProfile?.specialization ||
    "To be defined"
  );
}

function getProfileSummary(therapist: TherapistListItem) {
  return (
    therapist.therapistProfile?.bio ||
    therapist.therapistProfile?.therapyServicesProvided ||
    "Profile details will expand as therapist onboarding continues."
  );
}

function getDescription(therapist: TherapistListItem) {
  const specialisation = getSpecialisation(therapist);
  const profileSummary = getProfileSummary(therapist);

  if (
    specialisation &&
    profileSummary &&
    profileSummary.toLowerCase().includes(specialisation.toLowerCase())
  ) {
    return profileSummary;
  }

  return `${specialisation}. ${profileSummary}`;
}

type TherapistCardProps = {
  therapist: TherapistListItem;
};

const DESCRIPTION_EXPAND_THRESHOLD = 260;

export function TherapistCard({ therapist }: TherapistCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayName = getDisplayName(therapist);
  const description = getDescription(therapist);
  const canExpandDescription = description.length > DESCRIPTION_EXPAND_THRESHOLD;
  const profilePhotoUrl = therapist.therapistProfile?.profilePhotoUrl;

  return (
    <InsetCard
      as="article"
      tone="plain"
      className="grid grid-cols-1 gap-5 overflow-hidden rounded-[1.5rem] border-slate-100 bg-white/90 p-4 shadow-sm shadow-slate-950/5 sm:p-5 md:grid-cols-[230px_minmax(0,1fr)] md:items-start md:gap-6 xl:grid-cols-[250px_minmax(0,1fr)_190px] xl:gap-8"
    >
      <TherapistProfilePhoto
        displayName={displayName}
        profilePhotoUrl={profilePhotoUrl}
        className="h-[230px] min-h-[230px] w-full text-5xl md:w-[230px] xl:h-[250px] xl:w-[250px]"
      />

      <div className="min-w-0 [overflow-wrap:anywhere]">
        <h3 className="text-2xl font-semibold leading-tight text-slate-950">
          {displayName}
        </h3>
        <p className="mt-1 text-base leading-6 text-slate-700">
          {formatYearsOfExperience(therapist.therapistProfile?.yearsOfExperience) ?? "Experience shared during onboarding"}
        </p>
        <p className="mt-4 text-base font-semibold leading-6 text-sky-700">
          {formatSessionPricePerHour(therapist.therapistProfile?.sessionPricePence) ?? "Price will be confirmed later"}
        </p>

        <p
          className={[
            "mt-8 max-w-3xl text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]",
            isExpanded || !canExpandDescription
              ? ""
              : "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]",
          ].join(" ")}
        >
          {description}
        </p>

        {canExpandDescription ? (
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="mt-2 inline-flex text-sm font-semibold text-slate-950 underline decoration-slate-400 underline-offset-2 transition hover:text-sky-700 hover:decoration-sky-600"
          >
            {isExpanded ? "Read less" : "Read more"}
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3 md:col-start-2 md:flex-row md:items-start xl:col-start-auto xl:w-[190px] xl:flex-col">
        <ButtonLink
          href={`/client/book/${therapist.id}`}
          variant="primary"
          fullWidth
          className="!bg-sky-600 shadow-sm shadow-slate-950/10 hover:!bg-sky-700"
        >
          Book session
        </ButtonLink>
      </div>
    </InsetCard>
  );
}
