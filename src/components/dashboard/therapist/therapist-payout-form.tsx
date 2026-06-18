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
import { Badge } from "@/components/ui/badge";
import { SectionEyebrow, SurfaceCard } from "@/components/ui/card";

type TherapistPayoutFormProps = {
  data: TherapistPayoutDetailsView;
  googleCalendars: TherapistGoogleCalendarOption[];
  googleCalendarFlash?: {
    status: "success" | "error";
    message: string;
  } | null;
  stripeConnectFlash?: {
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

function getStripeBadgeClass(isReady: boolean) {
  return isReady
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function formatStripeStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

export function TherapistPayoutForm({
  data,
  googleCalendars,
  googleCalendarFlash,
  stripeConnectFlash,
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
  const calendarButtonDisabled = !googleCalendars.length || calendarPending;
  const stripeReady =
    Boolean(data.profile.stripeAccountId) &&
    data.profile.stripePayoutsEnabled &&
    data.profile.stripeDetailsSubmitted &&
    data.profile.stripeOnboardingStatus === "READY";

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <SurfaceCard>
        <SectionEyebrow>Therapist finance</SectionEyebrow>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-slate-900">Stripe payouts</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Connect Stripe before paid sessions become available to clients.
            </p>
          </div>
          <Badge className={getStripeBadgeClass(stripeReady)}>
            {stripeReady ? "Stripe ready" : "Stripe not ready"}
          </Badge>
        </div>

        {stripeConnectFlash ? (
          <div className="mt-6">
            <DashboardStatusAlert
              tone={stripeConnectFlash.status === "success" ? "success" : "error"}
              title={stripeConnectFlash.status === "success" ? "Stripe updated" : "Stripe connection failed"}
            >
              {stripeConnectFlash.message}
            </DashboardStatusAlert>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 rounded-[1.25rem] border border-slate-200/70 bg-slate-50/80 px-4 py-4 text-sm text-slate-700">
          <div className="flex items-start justify-between gap-4">
            <span className="font-medium">Onboarding status</span>
            <span className="text-right capitalize">{formatStripeStatus(data.profile.stripeOnboardingStatus)}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="font-medium">Details submitted</span>
            <span className="text-right">{data.profile.stripeDetailsSubmitted ? "Yes" : "No"}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="font-medium">Payouts</span>
            <span className="text-right">{data.profile.stripePayoutsEnabled ? "Enabled" : "Not enabled"}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="font-medium">Last sync</span>
            <span className="text-right">{formatConnectionDate(data.profile.stripeAccountSyncedAt)}</span>
          </div>
          {data.profile.stripeDisabledReason ? (
            <div className="flex items-start justify-between gap-4">
              <span className="font-medium">Stripe reason</span>
              <span className="max-w-[16rem] text-right">{data.profile.stripeDisabledReason}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5">
          <ButtonLink
            href="/api/stripe/connect/account-link"
            fullWidth
            className="border border-slate-900 !bg-slate-900 !text-white shadow-sm shadow-slate-950/10"
          >
            {data.profile.stripeAccountId ? "Continue Stripe onboarding" : "Connect Stripe account"}
          </ButtonLink>
        </div>

        <form action={formAction} className="mt-8 grid gap-4">
          {state.message ? (
            <DashboardStatusAlert tone={state.status === "success" ? "success" : "error"} title={state.status === "success" ? "Saved" : "Unable to save"}>
              {state.message}
            </DashboardStatusAlert>
          ) : null}

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
            {state.fieldErrors?.sessionPriceGbp?.[0] ? (
              <span className="text-rose-700">{state.fieldErrors.sessionPriceGbp[0]}</span>
            ) : null}
          </label>

          <Button type="submit" loading={pending} loadingText="Saving...">
            Save session price
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
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Connected at</dt>
              <dd className="text-right">{formatConnectionDate(data.profile.googleCalendarConnectedAt)}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard as="article" className="p-6">
          <h3 className="text-xl font-semibold text-slate-900">Target calendar</h3>
          {googleCalendarFlash ? (
            <div className="mt-5">
              <DashboardStatusAlert
                tone={googleCalendarFlash.status === "success" ? "success" : "error"}
                title={googleCalendarFlash.status === "success" ? "Calendar connected" : "Connection failed"}
              >
                {googleCalendarFlash.message}
              </DashboardStatusAlert>
            </div>
          ) : null}
          {!data.profile.isGoogleCalendarConnected ? (
            <div className="mt-5">
              <DashboardStatusAlert tone="warning" title="Google Calendar is not connected">
                Connect Google Calendar before confirmed sessions can create Meet links.
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
      </section>
    </div>
  );
}
