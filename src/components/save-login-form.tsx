"use client";

import { useActionState } from "react";
import { saveLogin, type SaveLoginState } from "@/actions/save-login";

export function SaveLoginForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<SaveLoginState, FormData>(saveLogin, null);

  if (state?.ok) {
    return <p className="small muted">Login saved. Manage will find this group.</p>;
  }

  return (
    <form action={action} className="card stack">
      <div className="stack stack--tight">
        <h2>Save login</h2>
        <p className="muted small">Optional. Email and password so Manage can find this group later.</p>
      </div>
      <input type="hidden" name="groupId" value={groupId} />
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
      <button className="btn btn--secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save login"}
      </button>
    </form>
  );
}
