"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createPromoCodeAction,
  type AdminPromoCodeActionState,
} from "@/app/admin/promocodes/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SectionEyebrow, SurfaceCard } from "@/components/ui/card";

const initialState: AdminPromoCodeActionState = { status: "idle" };

export function AdminPromoCodeCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    createPromoCodeAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <SurfaceCard as="section">
      <SectionEyebrow>Campaign setup</SectionEyebrow>
      <h2 className="mt-3 text-3xl font-semibold text-slate-900">
        Create promo code
      </h2>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
        Promo codes provide a discount funded from Theraply&apos;s platform fee.
        The therapist payout is not reduced.
      </p>

      <form
        ref={formRef}
        action={action}
        className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(10rem,0.5fr)_minmax(0,1fr)_auto] lg:items-end"
      >
        <div>
          <label htmlFor="promoCode" className="text-sm font-semibold text-slate-900">
            Promo code
          </label>
          <input
            id="promoCode"
            name="code"
            type="text"
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_-]{3,32}"
            autoComplete="off"
            disabled={pending}
            placeholder="SAVE5"
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm uppercase text-slate-900 outline-none transition focus:border-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="promoDiscountPercent"
            className="text-sm font-semibold text-slate-900"
          >
            Discount %
          </label>
          <input
            id="promoDiscountPercent"
            name="discountPercent"
            type="number"
            required
            min={1}
            max={10}
            step={1}
            disabled={pending}
            placeholder="5"
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </div>

        <div>
          <label
            htmlFor="promoExpiresAt"
            className="text-sm font-semibold text-slate-900"
          >
            Expiry date/time (UTC)
          </label>
          <input
            id="promoExpiresAt"
            name="expiresAt"
            type="datetime-local"
            step={60}
            disabled={pending}
            className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          />
        </div>

        <Button
          type="submit"
          loading={pending}
          loadingText="Creating..."
          className="min-h-11"
        >
          Create
        </Button>
      </form>

      {state.status !== "idle" && state.message ? (
        <div className="mt-5" aria-live="polite">
          <Alert tone={state.status === "error" ? "error" : "success"}>
            {state.message}
          </Alert>
        </div>
      ) : null}
    </SurfaceCard>
  );
}
