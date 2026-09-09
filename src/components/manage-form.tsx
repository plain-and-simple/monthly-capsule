"use client";

import { useActionState } from "react";
import { manageLogin, type ManageLoginState } from "@/actions/manage-login";
import {
  ACCOUNT_PASSWORD_LABEL,
  LANDING_MANAGE_HEADING,
  LANDING_SIGN_IN,
} from "@/lib/copy";

export function ManageForm() {
  const [state, action, pending] = useActionState<ManageLoginState, FormData>(
    manageLogin,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl font-medium leading-tight">{LANDING_MANAGE_HEADING}</h1>
        <p className="landing-sign-in">{LANDING_SIGN_IN}</p>
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">{ACCOUNT_PASSWORD_LABEL}</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
        />
      </div>
      {state?.error ? <p className="err">{state.error}</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Continuing…" : "Continue"}
      </button>
    </form>
  );
}
