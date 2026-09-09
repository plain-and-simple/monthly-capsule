"use client";

import { useActionState } from "react";
import { manageLogin, type ManageLoginState } from "@/actions/manage-login";

export function ManageForm() {
  const [state, action, pending] = useActionState<ManageLoginState, FormData>(
    manageLogin,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      <h1 className="font-serif text-4xl leading-tight">Manage your capsule</h1>
      <p className="text-muted">Email and password. No phone.</p>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
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
