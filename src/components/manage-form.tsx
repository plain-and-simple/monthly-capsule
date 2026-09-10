"use client";

import { useActionState } from "react";
import { manageLogin, type ManageLoginState } from "@/actions/manage-login";
import { ACCOUNT_PASSWORD_LABEL, LANDING_SIGN_IN } from "@/lib/copy";

export function ManageForm() {
  const [state, action, pending] = useActionState<ManageLoginState, FormData>(
    manageLogin,
    null,
  );

  return (
    <form action={action} className="stack">
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
      {state?.error ? <p className="err">{state.error}</p> : null}
      <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={pending}>
        {pending ? "Signing in…" : LANDING_SIGN_IN}
      </button>
    </form>
  );
}
