"use client";

import { useActionState, useRef } from "react";
import {
  approveTherapistAction,
  requestTherapistChangesAction,
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
  const requestChangesDialogRef = useRef<HTMLDialogElement>(null);
  const [approveState, approveAction, approvePending] = useActionState<
    AdminTherapistReviewActionState,
    FormData
  >(approveTherapistAction, initialActionState);
  const [requestChangesState, requestChangesAction, requestChangesPending] = useActionState<
    AdminTherapistReviewActionState,
    FormData
  >(requestTherapistChangesAction, initialActionState);
  const [rejectState, rejectAction, rejectPending] = useActionState<
    AdminTherapistReviewActionState,
    FormData
  >(rejectTherapistAction, initialActionState);
  const pending = approvePending || requestChangesPending || rejectPending;
  const requestChangesDialogTitleId = `requestChangesTitle-${therapistProfileId}`;

  return (
    <div className="space-y-3">
      <ActionStateAlert state={approveState} />
      <ActionStateAlert state={rejectState} />

      <div className="flex flex-wrap gap-3">
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

        <Button
          type="button"
          variant="warning"
          size="sm"
          disabled={pending}
          onClick={() => requestChangesDialogRef.current?.showModal()}
        >
          Request changes
        </Button>

        <form action={rejectAction}>
          <input type="hidden" name="therapistProfileId" value={therapistProfileId} />
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

      <dialog
        ref={requestChangesDialogRef}
        aria-labelledby={requestChangesDialogTitleId}
        onCancel={(event) => {
          if (requestChangesPending) {
            event.preventDefault();
          }
        }}
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-3xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
      >
        <form action={requestChangesAction} className="space-y-5 p-6">
          <input type="hidden" name="therapistProfileId" value={therapistProfileId} />
          <div>
            <h3
              id={requestChangesDialogTitleId}
              className="text-lg font-semibold text-slate-950"
            >
              Request changes
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Tell the therapist exactly what needs to be updated before their profile can be
              reviewed again.
            </p>
          </div>

          <ActionStateAlert state={requestChangesState} />

          <div>
            <label
              htmlFor={`changesMessage-${therapistProfileId}`}
              className="text-sm font-semibold text-slate-900"
            >
              What should the therapist update?
            </label>
            <textarea
              id={`changesMessage-${therapistProfileId}`}
              name="message"
              rows={5}
              required
              minLength={10}
              maxLength={2000}
              autoFocus
              disabled={requestChangesPending}
              className="mt-2 w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-900"
              placeholder="Please upload a clearer certificate image and update your years of experience."
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              The therapist will receive this message and can edit and resubmit their profile.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={requestChangesPending}
              onClick={() => requestChangesDialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={requestChangesPending}
              loadingText="Sending..."
            >
              Send update request
            </Button>
          </div>
        </form>
      </dialog>

    </div>
  );
}
