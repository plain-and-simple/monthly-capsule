"use client";

import { useActionState } from "react";
import { saveLogin, type SaveLoginState } from "@/actions/save-login";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { SAVE_LOGIN_REQUIRED_HEADING, SAVE_LOGIN_REQUIRED_HINT } from "@/lib/copy";

export function SaveLoginForm({
  groupId,
  next,
}: {
  groupId: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState<SaveLoginState, FormData>(saveLogin, null);
  const { busy, markBusy } = useInstantBusy(pending);

  return (
    <form action={action} className="card stack" onSubmit={markBusy} aria-busy={busy || undefined}>
      <div className="stack stack--tight">
        <h2>{SAVE_LOGIN_REQUIRED_HEADING}</h2>
        <p className="muted small">{SAVE_LOGIN_REQUIRED_HINT}</p>
      </div>
      <input type="hidden" name="groupId" value={groupId} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="field">
        <span className="field__label">Email</span>
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      {state?.error ? <p className="err">{state.error}</p> : null}
      <PendingSubmitButton className="btn btn--secondary" busy={busy} pendingLabel="Saving…">
        Save login
      </PendingSubmitButton>
    </form>
  );
}
