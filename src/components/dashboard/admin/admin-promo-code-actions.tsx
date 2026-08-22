"use client";

import { useActionState } from "react";
import {
  activatePromoCodeAction,
  deactivatePromoCodeAction,
  type AdminPromoCodeActionState,
  updatePromoCodeAction,
} from "@/app/admin/promocodes/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type AdminPromoCodeActionsProps = {
  promoCodeId: string;
  discountPercent: number;
  isActive: boolean;
  expiresAtInput: string;
  usageCount: number;
};

const initialState: AdminPromoCodeActionState = { status: "idle" };

function ActionMessage({ state }: { state: AdminPromoCodeActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <Alert tone={state.status === "error" ? "error" : "success"}>
      {state.message}
    </Alert>
  );
}

export function AdminPromoCodeActions({
  promoCodeId,
  discountPercent,
  isActive,
  expiresAtInput,
  usageCount,
}: AdminPromoCodeActionsProps) {
  const [updateState, updateAction, updatePending] = useActionState(
    updatePromoCodeAction,
    initialState,
  );
  const [activateState, activateAction, activatePending] = useActionState(
    activatePromoCodeAction,
    initialState,
  );
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(
    deactivatePromoCodeAction,
    initialState,
  );
  const pending = updatePending || activatePending || deactivatePending;
  const lifecycleState = isActive ? activateState : deactivateState;

  return (
    <div className="min-w-[18rem] space-y-3">
      <ActionMessage state={updateState} />
      <ActionMessage state={lifecycleState} />

      <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="promoCodeId" value={promoCodeId} />
        {usageCount > 0 ? (
          <input type="hidden" name="discountPercent" value={discountPercent} />
        ) : null}
        <div>
          <label
            htmlFor={`discount-${promoCodeId}`}
            className="text-xs font-semibold text-slate-700"
          >
            Discount %
          </label>
          <input
            id={`discount-${promoCodeId}`}
            name={usageCount > 0 ? undefined : "discountPercent"}
            type="number"
            min={1}
            max={10}
            step={1}
            required
            defaultValue={discountPercent}
            disabled={pending || usageCount > 0}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </div>
        <div>
          <label
            htmlFor={`expiry-${promoCodeId}`}
            className="text-xs font-semibold text-slate-700"
          >
            Expiry (UTC)
          </label>
          <input
            id={`expiry-${promoCodeId}`}
            name="expiresAt"
            type="datetime-local"
            step={60}
            defaultValue={expiresAtInput}
            disabled={pending}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={updatePending}
            loadingText="Saving..."
            disabled={pending}
          >
            Save settings
          </Button>
        </div>
      </form>

      {usageCount > 0 ? (
        <p className="text-xs leading-5 text-slate-500">
          The code and discount are locked after first use. Expiry and status remain editable.
        </p>
      ) : (
        <p className="text-xs leading-5 text-slate-500">
          The code is permanent. Discount can be changed until first use.
        </p>
      )}

      {isActive ? (
        <form action={deactivateAction}>
          <input type="hidden" name="promoCodeId" value={promoCodeId} />
          <Button
            type="submit"
            variant="warning"
            size="sm"
            loading={deactivatePending}
            loadingText="Deactivating..."
            disabled={pending}
          >
            Deactivate
          </Button>
        </form>
      ) : (
        <form action={activateAction}>
          <input type="hidden" name="promoCodeId" value={promoCodeId} />
          <Button
            type="submit"
            variant="success"
            size="sm"
            loading={activatePending}
            loadingText="Reactivating..."
            disabled={pending}
          >
            Reactivate
          </Button>
        </form>
      )}
    </div>
  );
}
