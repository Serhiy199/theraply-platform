"use client";

import { useActionState } from "react";
import {
  createBookingRequestAction,
  type BookingRequestActionState,
} from "@/app/client/book/actions";
import { BookingStatusAlert } from "@/components/booking/client/booking-status-alert";

type RequestSlotFormProps = {
  therapistId: string;
  startsAt: string;
  endsAt: string;
};

const initialBookingRequestActionState: BookingRequestActionState = {
  status: "idle",
};

function getErrorTone(state: BookingRequestActionState) {
  if (state.code === "conflict") return "warning" as const;
  return "error" as const;
}

function getErrorTitle(state: BookingRequestActionState) {
  if (state.code === "conflict") return "Slot conflict detected";
  if (state.code === "validation") return "Invalid booking request";
  return "Unable to create request";
}

export function RequestSlotForm({ therapistId, startsAt, endsAt }: RequestSlotFormProps) {
  const [state, formAction, pending] = useActionState<BookingRequestActionState, FormData>(
    createBookingRequestAction,
    initialBookingRequestActionState,
  );
  const buttonDisabled = pending;

  return (
    <form action={formAction} className="mt-4 grid gap-3">
      <input type="hidden" name="therapistId" value={therapistId} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <input type="hidden" name="notes" value="" />

      {pending ? (
        <BookingStatusAlert title="Sending request">
          We are checking the slot one more time before turning it into a booking request.
        </BookingStatusAlert>
      ) : null}

      {state.status === "error" && state.message ? (
        <BookingStatusAlert tone={getErrorTone(state)} title={getErrorTitle(state)}>
          {state.message}
        </BookingStatusAlert>
      ) : null}

      <button
        type="submit"
        disabled={buttonDisabled}
        className={[
          "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
          buttonDisabled
            ? "cursor-not-allowed bg-slate-300 !text-slate-800"
            : "cursor-pointer bg-slate-900 !text-white hover:bg-slate-800",
        ].join(" ")}
        style={{ color: buttonDisabled ? "#1f2937" : "#ffffff" }}
      >
        {pending ? "Sending request..." : "Request this slot"}
      </button>
    </form>
  );
}
