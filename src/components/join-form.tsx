"use client";

import { useActionState, useState } from "react";
import { joinGroup, type JoinState } from "@/actions/join-group";

export function JoinForm({
  uuid,
  signedInAs,
}: {
  uuid?: string;
  signedInAs?: string | null;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinGroup, null);
  const [saveLogin, setSaveLogin] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <h1 className="font-serif text-4xl leading-tight">Join</h1>
      {uuid ? (
        <input type="hidden" name="uuid" value={uuid} />
      ) : (
        <div className="field">
          <label htmlFor="uuid">Join link or group ID</label>
          <input id="uuid" name="uuid" required autoComplete="off" />
        </div>
      )}
      <div className="field">
        <label htmlFor="pin">PIN</label>
        <input
          id="pin"
          name="pin"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="preferred_name">Preferred name</label>
        <input
          id="preferred_name"
          name="preferred_name"
          maxLength={40}
          required
          defaultValue={signedInAs ?? ""}
        />
      </div>
      {signedInAs ? (
        <p className="text-sm text-muted">Signed in as {signedInAs}. This group will appear in Manage.</p>
      ) : (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="save_login"
              value="1"
              checked={saveLogin}
              onChange={(event) => setSaveLogin(event.target.checked)}
              className="mt-1"
            />
            <span>Save login so Manage can find this group</span>
          </label>
          {saveLogin ? (
            <>
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
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Skip to join this capsule only. Manage will not list it until you save a login.
            </p>
          )}
        </>
      )}
      {state?.error ? <p className="err">{state.error}</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
