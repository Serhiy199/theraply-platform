"use client";

import { useActionState } from "react";
import {
  createBookingRequestAction,
  initialBookingRequestActionState,
  type BookingRequestActionState,
} from "@/app/client/book/actions";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";

type RequestSlotFormProps = {
  therapistId: string;
  startsAt: string;
  endsAt: string;
};

export function RequestSlotForm({ therapistId, startsAt, endsAt }: RequestSlotFormProps) {
  const [state, formAction, pending] = useActionState<BookingRequestActionState, FormData>(
    createBookingRequestAction,
    initialBookingRequestActionState,
  );

  return (
    <form action={formAction} className="mt-4 grid gap-3">
      <input type="hidden" name="therapistId" value={therapistId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <input type="hidden" name="notes" value="" />

      {state.status === "error" && state.message ? (
        <DashboardStatusAlert tone="error" title="Unable to create request">
          {state.message}
        </DashboardStatusAlert>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "Sending request..." : "Request this slot"}
      </button>
    </form>
  );
}