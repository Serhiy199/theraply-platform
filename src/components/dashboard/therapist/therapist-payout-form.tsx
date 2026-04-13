"use client";

import { useActionState } from "react";
import {
  initialPayoutDetailsActionState,
  payoutDetailsAction,
  type PayoutDetailsActionState,
} from "@/app/therapist/payout-details/actions";
import type { TherapistPayoutDetailsView } from "@/server/services/therapist-bookings.service";

type TherapistPayoutFormProps = {
  data: TherapistPayoutDetailsView;
};

export function TherapistPayoutForm({ data }: TherapistPayoutFormProps) {
  const [state, formAction, pending] = useActionState<PayoutDetailsActionState, FormData>(
    payoutDetailsAction,
    initialPayoutDetailsActionState,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className="soft-card rounded-[2rem] border border-slate-200/70 p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Therapist finance</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-900">Payout details</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Keep payout information current so the finance workflow stays clean when settlements and therapist payouts are turned on.
        </p>

        <form action={formAction} className="mt-6 grid gap-4">
          {state.message ? (
            <div className={`rounded-[1.25rem] border px-4 py-3 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
              {state.message}
            </div>
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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">IBAN</span>
              <input name="iban" defaultValue={data.payoutDetails?.iban ?? ""} className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500" />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-medium">SWIFT</span>
              <input name="swift" defaultValue={data.payoutDetails?.swift ?? ""} className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500" />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-slate-700">
            <span className="font-medium">Country</span>
            <input name="country" defaultValue={data.payoutDetails?.country ?? ""} className="rounded-[1rem] border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500" />
          </label>

          <button type="submit" disabled={pending} className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
            {pending ? "Saving..." : "Save payout details"}
          </button>
        </form>
      </section>

      <section className="grid gap-4">
        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
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
            <div className="flex items-start justify-between gap-4">
              <dt className="font-medium text-slate-700">Calendar email</dt>
              <dd className="text-right">{data.profile.googleCalendarEmail ?? "Not connected yet"}</dd>
            </div>
          </dl>
        </article>

        <article className="soft-card rounded-[2rem] border border-slate-200/70 p-6">
          <h3 className="text-xl font-semibold text-slate-900">Verification state</h3>
          <div className={`mt-5 rounded-[1.5rem] border px-4 py-4 text-sm ${data.payoutDetails?.isVerified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {data.payoutDetails?.isVerified ? "Payout details have already been verified by the operational team." : "Payout details are not verified yet. Complete the profile to prepare for admin review."}
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Once this information is complete, the admin panel can review it and mark the payout profile as ready for operations.
          </p>
        </article>
      </section>
    </div>
  );
}
