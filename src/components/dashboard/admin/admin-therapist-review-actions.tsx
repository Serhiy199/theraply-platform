"use client";

import { useActionState } from "react";
import {
  approveTherapistAction,
  rejectTherapistAction,
  type AdminTherapistReviewActionState,
} from "@/app/admin/therapists/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type AdminTherapistReviewActionsProps = {
  therapistProfileId: string;
};

const initialActionState: AdminTherapistReviewActionState = {
  status: "idle",
};

function ActionStateAlert({ state }: { state: AdminTherapistReviewActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <Alert
      tone={
        state.status === "error"
          ? "error"
          : state.wixSyncStatus === "failed"
            ? "warning"
            : "success"
      }
    >
      {state.message}
    </Alert>
  );
}

export function AdminTherapistReviewActions({
  therapistProfileId,
}: AdminTherapistReviewActionsProps) {
  const [approveState, approveAction, approvePending] = useActionState<
    AdminTherapistReviewActionState,
    FormData
  >(approveTherapistAction, initialActionState);
  const [rejectState, rejectAction, rejectPending] = useActionState<
    AdminTherapistReviewActionState,
    FormData
  >(rejectTherapistAction, initialActionState);
  const pending = approvePending || rejectPending;

  return (
    <div className="space-y-3">
      <ActionStateAlert state={approveState} />
      <ActionStateAlert state={rejectState} />

      <form action={approveAction}>
        <input type="hidden" name="therapistProfileId" value={therapistProfileId} />
        <Button
          type="submit"
          variant="success"
          size="sm"
          loading={approvePending}
          loadingText="Approving..."
          disabled={pending}
        >
          Approve
        </Button>
      </form>

      <form action={rejectAction} className="space-y-3">
        <input type="hidden" name="therapistProfileId" value={therapistProfileId} />
        <div>
          <label
            htmlFor={`rejectionReason-${therapistProfileId}`}
            className="text-sm font-semibold text-slate-900"
          >
            Rejection reason
          </label>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Required before rejecting. This reason is shown to the therapist so they can update and
            resubmit their onboarding form.
          </p>
          <textarea
            id={`rejectionReason-${therapistProfileId}`}
            name="rejectionReason"
            rows={3}
            required
            minLength={3}
            disabled={pending}
            className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-900"
          />
        </div>
        <Button
          type="submit"
          variant="danger"
          size="sm"
          loading={rejectPending}
          loadingText="Rejecting..."
          disabled={pending}
        >
          Reject
        </Button>
      </form>
    </div>
  );
}
