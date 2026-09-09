"use client";

import { useActionState, useState } from "react";
import { regeneratePin, type RegenPinState } from "@/actions/regenerate-pin";
import { CopyButton } from "@/components/copy-button";
import { REGEN_CONFIRM_VALUE } from "@/lib/manage";

export function RegenPinForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<RegenPinState, FormData>(
    regeneratePin,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-2xl leading-tight">PIN</h2>
        <p className="text-muted">PIN is shown once. The old PIN stops working.</p>
        <div className="rounded-xl border border-rule bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted">PIN</p>
          <p className="mt-1 font-serif text-3xl tracking-[0.2em]">{state.pin}</p>
          <div className="mt-2">
            <CopyButton text={state.pin} label="Copy PIN" />
          </div>
        </div>
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="space-y-4">
        <h2 className="font-serif text-2xl leading-tight">PIN</h2>
        {state && !state.ok ? <p className="err">{state.error}</p> : null}
        <button className="btn btn-ghost" type="button" onClick={() => setConfirming(true)}>
          Regenerate PIN
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <h2 className="font-serif text-2xl leading-tight">PIN</h2>
      <p className="text-muted">The current PIN will stop working.</p>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="confirm" value={REGEN_CONFIRM_VALUE} />
      {state && !state.ok ? <p className="err">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-ghost"
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Regenerating…" : "Regenerate PIN"}
        </button>
      </div>
    </form>
  );
}
