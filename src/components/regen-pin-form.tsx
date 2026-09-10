"use client";

import { useActionState, useState } from "react";
import { regeneratePin, type RegenPinState } from "@/actions/regenerate-pin";
import { CopyButton } from "@/components/copy-button";
import { REGEN_CONFIRM_VALUE } from "@/lib/manage";

export function RegenPinForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<RegenPinState, FormData>(regeneratePin, null);
  const [confirming, setConfirming] = useState(false);

  if (state?.ok) {
    return (
      <section className="stack">
        <h2>Group PIN</h2>
        <p className="small muted">
          The PIN is shown this one time. The old PIN stops working right away. People already in
          the group stay in.
        </p>
        <div className="pinbox">
          <span className="pin">{state.pin}</span>
          <CopyButton text={state.pin} label="Copy" className="btn btn--quiet" />
        </div>
      </section>
    );
  }

  if (!confirming) {
    return (
      <section className="stack">
        <h2>Group PIN</h2>
        <p className="small muted">
          We store the PIN scrambled, so nobody — including us — can look it up. If it has gone
          astray, make a new one and tell the group.
        </p>
        {state && !state.ok ? <p className="err">{state.error}</p> : null}
        <div>
          <button className="btn btn--secondary" type="button" onClick={() => setConfirming(true)}>
            Make a new PIN
          </button>
        </div>
      </section>
    );
  }

  return (
    <form action={action} className="stack">
      <h2>Group PIN</h2>
      <p className="small muted">
        The old PIN stops working right away. People already in the group stay in.
      </p>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="confirm" value={REGEN_CONFIRM_VALUE} />
      {state && !state.ok ? <p className="err">{state.error}</p> : null}
      <div className="row">
        <button
          className="btn btn--secondary"
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
        <button className="btn btn--primary" type="submit" disabled={pending}>
          {pending ? "Making…" : "Make a new PIN"}
        </button>
      </div>
    </form>
  );
}
