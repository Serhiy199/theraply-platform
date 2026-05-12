"use client";

import { useActionState } from "react";
import {
  saveTherapistOnboardingDraftAction,
  submitTherapistOnboardingForReviewAction,
} from "@/app/therapist/onboarding/actions";
import type { TherapistOnboardingActionState } from "@/app/therapist/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type TherapistOnboardingFormValues = {
  nameAndSurname: string;
  gender: string;
  email: string;
  contactNumber: string;
  therapyServicesProvided: string;
  yearsOfExperience: string;
  educationAndCertifications: string;
  specialisation: string;
  pricePerHour: string;
  certificates: {
    id: string;
    fileName: string;
    fileUrl: string;
    publicId: string;
    storageProvider: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }[];
  displayName: string;
  bio: string;
  specialization: string;
};

type TherapistOnboardingFormProps = {
  initialValues: TherapistOnboardingFormValues;
};

const initialActionState: TherapistOnboardingActionState = {
  status: "idle",
};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return <p className="mt-2 text-sm text-rose-700">{messages[0]}</p>;
}

function getStatusAlert(state: TherapistOnboardingActionState) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <Alert tone={state.status === "success" ? "success" : "error"}>
      {state.message}
    </Alert>
  );
}

export function TherapistOnboardingForm({
  initialValues,
}: TherapistOnboardingFormProps) {
  const [saveState, saveAction, savePending] = useActionState<
    TherapistOnboardingActionState,
    FormData
  >(saveTherapistOnboardingDraftAction, initialActionState);
  const [submitState, submitAction, submitPending] = useActionState<
    TherapistOnboardingActionState,
    FormData
  >(submitTherapistOnboardingForReviewAction, initialActionState);
  const fieldErrors =
    submitState.status === "error" && submitState.fieldErrors
      ? submitState.fieldErrors
      : saveState.fieldErrors;
  const pending = savePending || submitPending;

  return (
    <form className="mt-6 space-y-5">
      <div className="grid gap-3">
        {getStatusAlert(saveState)}
        {getStatusAlert(submitState)}
      </div>

      <div>
        <label
          htmlFor="displayName"
          className="text-sm font-semibold text-slate-900"
        >
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          defaultValue={initialValues.displayName}
          autoComplete="name"
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
        />
        <FieldError messages={fieldErrors?.displayName} />
      </div>

      <div>
        <label htmlFor="bio" className="text-sm font-semibold text-slate-900">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={initialValues.bio}
          rows={7}
          className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-900"
        />
        <FieldError messages={fieldErrors?.bio} />
      </div>

      <div>
        <label
          htmlFor="specialization"
          className="text-sm font-semibold text-slate-900"
        >
          Specialization
        </label>
        <input
          id="specialization"
          name="specialization"
          type="text"
          defaultValue={initialValues.specialization}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
        />
        <FieldError messages={fieldErrors?.specialization} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          variant="secondary"
          loading={savePending}
          disabled={pending}
          formAction={saveAction}
        >
          Save draft
        </Button>
        <Button
          type="submit"
          loading={submitPending}
          disabled={pending}
          formAction={submitAction}
        >
          Submit for review
        </Button>
      </div>
    </form>
  );
}

export type { TherapistOnboardingFormValues };
