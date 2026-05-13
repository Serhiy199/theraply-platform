"use client";

import { useActionState } from "react";
import { DashboardStatusAlert } from "@/components/dashboard/shared/dashboard-status-alert";
import {
  googleCalendarSelectionAction,
  payoutDetailsAction,
  type GoogleCalendarSelectionActionState,
  type PayoutDetailsActionState,
} from "@/app/therapist/payout-details/actions";
import type { TherapistPayoutDetailsView } from "@/server/services/therapist-bookings.service";
import type { TherapistGoogleCalendarOption } from "@/server/services/google-calendar.service";
import { Button, ButtonLink } from "@/components/ui/button";
import { SectionEyebrow, SurfaceCard } from "@/components/ui/card";

type TherapistPayoutFormProps = {
  data: TherapistPayoutDetailsView;
  googleCalendars: TherapistGoogleCalendarOption[];
  googleCalendarFlash?: {
    status: "success" | "error";
    message: string;
  } | null;
};

const initialPayoutDetailsActionState: PayoutDetailsActionState = {
  status: "idle",
};

const initialGoogleCalendarSelectionActionState: GoogleCalendarSelectionActionState = {
  status: "idle",
};

function formatSessionPriceInput(value: number | null) {
  if (typeof value !== "number") {
    return "";
  }

  return (value / 100).toFixed(2);
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number") {
    return "Not set yet";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value / 100);
}

function formatConnectionDate(value: Date | null) {
  if (!value) {
    return "Not connected yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function TherapistPayoutForm({
  data,
  googleCalendars,
  googleCalendarFlash,
}: TherapistPayoutFormProps) {
  const [state, formAction, pending] = useActionState<PayoutDetailsActionState, FormData>(
    payoutDetailsAction,
    initialPayoutDetailsActionState,
  );
  const [calendarState, calendarFormAction, calendarPending] = useActionState<
    GoogleCalendarSelectionActionState,
    FormData
  >(
    googleCalendarSelectionAction,
    initialGoogleCalendarSelectionActionState,
  );
  const payoutButtonDisabled = pending;
  const calendarButtonDisabled = !googleCalendars.length || calendarPending;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <SurfaceCard>
        <SectionEyebrow>Therapist finance</SectionEyebrow>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payout details</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Keep payout information current so the finance workflow stays clean when settlements and therapist payouts are turned on.
        </p>
        {googleCalendarFlash ? (
          <div className="mt-6">
            <DashboardStatusAlert
              tone={googleCalendarFlash.status === "success" ? "success" : "error"}
              title={googleCalendarFlash.status === "success" ? "Calendar connected" : "Connection failed"}
            >
              {googleCalendarFlash.message}
            </DashboardStatusAlert>
          </div>
        ) : null}

        <form action={formAction} className="mt-6 grid gap-4">
          {state.message ? (
            <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"} title={state.status === "success" ? "Saved" : "Unable to save"}>
              {state.message}
            </DashboardStatusAlert>
          ) : null}

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">Account holder name</span>
            <input name="accountHolderName" defaultValue={data.payoutDetails?.accountHolderName ?? ""} className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500" />
            {state.fieldErrors?.accountHolderName?.[0] ? <span className="text-rose-700">{state.fieldErrors.accountHolderName[0]}</span> : null}
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">Bank name</span>
            <input name="bankName" defaultValue={data.payoutDetails?.bankName ?? ""} className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500" />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">IBAN</span>
            <input
              name="iban"
              defaultValue={data.payoutDetails?.iban ?? ""}
              className="min-w-0 rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">SWIFT</span>
            <input
              name="swift"
              defaultValue={data.payoutDetails?.swift ?? ""}
              className="min-w-0 rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">Country</span>
            <input name="country" defaultValue={data.payoutDetails?.country ?? ""} className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500" />
          </label>

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">Session price (GBP)</span>
            <input
              name="sessionPriceGbp"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={formatSessionPriceInput(data.profile.sessionPricePence)}
              className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
            <span className="text-xs leading-5 text-slate-500">
              This price will be shown in the booking flow and used for Stripe payments later in Phase 10.
            </span>
            {state.fieldErrors?.sessionPriceGbp?.[0] ? (
              <span className="text-rose-700">{state.fieldErrors.sessionPriceGbp[0]}</span>
            ) : null}
          </label>

          <Button
            type="submit"
            loading={pending}
            loadingText="Saving..."
          >
            Save payout details
          </Button>
        </form>
      </SurfaceCard>

      <section className="grid gap-4">
        <SurfaceCard as="article" className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">Profile context</h3>
          <dl className="mt-5 space-y-4 text-sm text-slate-600">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Display name</dt>
              <dd className="text-right">{data.profile.displayName ?? "Not set"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Specialization</dt>
              <dd className="text-right">{data.profile.specialization ?? "Not set"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Approval status</dt>
              <dd className="text-right">{data.profile.approvalStatus.replaceAll("_", " ")}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Session price</dt>
              <dd className="text-right">{formatCurrency(data.profile.sessionPricePence)}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Calendar email</dt>
              <dd className="text-right">{data.profile.googleCalendarEmail ?? "Not connected yet"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Calendar status</dt>
              <dd className="text-right">
                {data.profile.isGoogleCalendarConnected ? "Connected" : "Not connected"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/60 pb-4">
              <dt className="font-medium text-slate-700">Calendar ID</dt>
              <dd className="max-w-[16rem] break-all text-right">
                {data.profile.googleCalendarId ?? "Will appear after connection"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Connected at</dt>
              <dd className="text-right">{formatConnectionDate(data.profile.googleCalendarConnectedAt)}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard as="article" className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">Target calendar</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Choose which Google Calendar should receive confirmed session events. The primary calendar is selected automatically after the first connection, but you can change it here.
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Only calendars that this Google account can write to are shown here.
          </p>
          {!data.profile.isGoogleCalendarConnected ? (
            <div className="mt-5">
              <DashboardStatusAlert tone="warning" title="Google Calendar is not connected">
                Connect Google Calendar first. After the OAuth connection finishes, available calendars will appear in this selector.
              </DashboardStatusAlert>
              <div className="mt-4">
                <ButtonLink
                  href="/api/integrations/google/connect?returnTo=%2Ftherapist%2Fpayout-details"
                  fullWidth
                  className="border border-slate-900 !bg-slate-900 !text-white shadow-sm shadow-slate-950/10"
                >
                  Connect Google Calendar
                </ButtonLink>
              </div>
            </div>
          ) : null}

          <form action={calendarFormAction} className="mt-5 grid gap-4">
            {calendarState.message ? (
              <DashboardStatusAlert
                tone={calendarState.status === "success" ? "success" : "error"}
                title={calendarState.status === "success" ? "Calendar saved" : "Unable to save"}
              >
                {calendarState.message}
              </DashboardStatusAlert>
            ) : null}

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">Google Calendar</span>
              <select
                name="googleCalendarId"
                defaultValue={data.profile.googleCalendarId ?? ""}
                disabled={calendarButtonDisabled}
                className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
              >
                <option value="">
                  {googleCalendars.length
                    ? "Choose a calendar"
                    : "Connect Google Calendar first to load available calendars"}
                </option>
                {googleCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                    {calendar.primary ? " (Primary)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <Button
              type="submit"
              disabled={!googleCalendars.length}
              loading={calendarPending}
              loadingText="Saving..."
            >
              Save target calendar
            </Button>
          </form>
        </SurfaceCard>

        <SurfaceCard as="article" className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">Verification state</h3>
          <div className="mt-5">
            <DashboardStatusAlert tone={data.payoutDetails?.isVerified ? "success" : "warning"} title={data.payoutDetails?.isVerified ? "Verified" : "Review pending"}>
              {data.payoutDetails?.isVerified ? "Payout details have already been verified by the operational team." : "Payout details are not verified yet. Complete the profile to prepare for admin review."}
            </DashboardStatusAlert>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Once this information is complete, the admin panel can review it and mark the payout profile as ready for operations.
          </p>
        </SurfaceCard>
      </section>
    </div>
  );
}
