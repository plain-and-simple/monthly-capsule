"use client";

import { useActionState, useState } from "react";
import { banStudioAccount, type StudioBanState } from "@/actions/studio-ban";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import {
  STUDIO_BAN_ACTION,
  STUDIO_BAN_CONFIRM,
  STUDIO_BAN_HEADING,
  STUDIO_BAN_HINT,
} from "@/lib/copy";
import { BAN_CONFIRM_VALUE } from "@/lib/studio-admin";

export function StudioBanForm() {
  const [state, action, pending] = useActionState<StudioBanState, FormData>(banStudioAccount, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
      <div className="stack stack--tight">
        <h2>{STUDIO_BAN_HEADING}</h2>
        <p className="muted small">{STUDIO_BAN_HINT}</p>
      </div>
      <label className="field">
        <span className="field__label">Account email</span>
        <input className="input" name="email" type="email" required autoComplete="off" />
      </label>
      <input type="hidden" name="confirm" value={confirming ? BAN_CONFIRM_VALUE : ""} />
      {state?.ok ? <p className="muted small">{state.message}</p> : null}
      {state && !state.ok ? <p className="err">{state.error}</p> : null}
      {confirming ? (
        <>
          <p className="small muted">{STUDIO_BAN_CONFIRM}</p>
          <div className="row">
            <button
              className="btn btn--secondary"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <PendingSubmitButton className="btn btn--danger" busy={busy} pendingLabel="Banning…">
              {STUDIO_BAN_ACTION}
            </PendingSubmitButton>
          </div>
        </>
      ) : (
        <button className="btn btn--secondary" type="button" onClick={() => setConfirming(true)}>
          {STUDIO_BAN_ACTION}
        </button>
      )}
    </form>
  );
}
