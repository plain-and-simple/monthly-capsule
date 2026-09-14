"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "@/actions/sign-up";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { ACCOUNT_PASSWORD_LABEL, LANDING_SIGN_UP, PREFERRED_NAME_LABEL } from "@/lib/copy";

export function SignUpForm({ next }: { next?: string | null }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUp, null);
  const { busy, markBusy } = useInstantBusy(pending);

  return (
    <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
      <h2>{LANDING_SIGN_UP}</h2>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="field">
          <span className="field__label">{PREFERRED_NAME_LABEL}</span>
          <input
            className="input"
            name="preferred_name"
            required
            maxLength={40}
            autoComplete="nickname"
          />
        </label>
        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span className="field__label">{ACCOUNT_PASSWORD_LABEL}</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      </div>
      {state?.error ? <p className="err">{state.error}</p> : null}
      <PendingSubmitButton
        className="btn btn--primary btn--block btn--lg"
        busy={busy}
        pendingLabel="Creating…"
      >
        {LANDING_SIGN_UP}
      </PendingSubmitButton>
    </form>
  );
}
