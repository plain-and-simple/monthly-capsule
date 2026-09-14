"use client";

import Link from "next/link";
import { useActionState } from "react";
import { manageLogin, type ManageLoginState } from "@/actions/manage-login";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { ACCOUNT_PASSWORD_LABEL, FORGOT_PASSWORD_LINK, LANDING_SIGN_IN } from "@/lib/copy";

export function ManageForm() {
  const [state, action, pending] = useActionState<ManageLoginState, FormData>(
    manageLogin,
    null,
  );
  const { busy, markBusy } = useInstantBusy(pending);

  return (
    <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
      <h2>{LANDING_SIGN_IN}</h2>
      <div>
        <label className="field">
          <span className="field__label">Email</span>
          <input className="input" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="field">
          <span className="field__label">{ACCOUNT_PASSWORD_LABEL}</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
          />
        </label>
      </div>
      <p className="small">
        <Link href="/forgot">{FORGOT_PASSWORD_LINK}</Link>
      </p>
      {state?.error ? <p className="err">{state.error}</p> : null}
      <PendingSubmitButton
        className="btn btn--primary btn--block btn--lg"
        busy={busy}
        pendingLabel="Signing in…"
      >
        {LANDING_SIGN_IN}
      </PendingSubmitButton>
    </form>
  );
}
