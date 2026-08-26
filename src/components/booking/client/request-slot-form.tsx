"use client";

import { useActionState } from "react";
import {
  createBookingRequestAction,
  type BookingRequestActionState,
} from "@/app/client/book/actions";
import { BookingStatusAlert } from "@/components/booking/client/booking-status-alert";
import { Button } from "@/components/ui/button";

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
  if (state.code === "conflict") return "This time is no longer available";
  if (state.code === "validation") return "Invalid booking request";
  return "Unable to create request";
}

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

      <Button
        type="submit"
        loading={pending}
        loadingText="Sending request..."
        size="sm"
      >
        Request this slot
      </Button>
    </form>
  );
}
