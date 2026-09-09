"use client";

import { useActionState } from "react";
import { saveLogin, type SaveLoginState } from "@/actions/save-login";

export function SaveLoginForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<SaveLoginState, FormData>(saveLogin, null);

  if (state?.ok) {
    return <p className="text-sm text-muted">Login saved. Manage will find this group.</p>;
  }

  return (
    <form action={action} className="space-y-4 rounded-xl border border-rule bg-card p-5">
      <p className="font-serif text-xl">Save login</p>
      <p className="text-sm text-muted">
        Optional. Email and password so Manage can find this group later.
      </p>
      <input type="hidden" name="groupId" value={groupId} />
      <div className="field">
        <label htmlFor="save_email">Email</label>
        <input id="save_email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="save_password">Password</label>
        <input
          id="save_password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {state?.error ? <p className="err">{state.error}</p> : null}
      <button className="btn btn-ghost" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save login"}
      </button>
    </form>
  );
}
