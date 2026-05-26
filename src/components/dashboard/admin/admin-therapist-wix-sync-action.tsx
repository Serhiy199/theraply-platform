"use client";

import { useActionState } from "react";
import {
  retryWixTherapistSyncAction,
  type RetryWixTherapistSyncActionState,
} from "@/app/admin/therapists/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type AdminTherapistWixSyncActionProps = {
  therapistProfileId: string;
};

const initialRetryState: RetryWixTherapistSyncActionState = {
  status: "idle",
};

export function AdminTherapistWixSyncAction({
  therapistProfileId,
}: AdminTherapistWixSyncActionProps) {
  const [state, action, pending] = useActionState<RetryWixTherapistSyncActionState, FormData>(
    retryWixTherapistSyncAction,
    initialRetryState,
  );

  return (
    <div className="space-y-2">
      {state.status !== "idle" && state.message ? (
        <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="therapistProfileId" value={therapistProfileId} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={pending}
          loadingText="Syncing..."
        >
          Retry sync to Wix
        </Button>
      </form>
    </div>
  );
}
