"use client";

import { useActionState } from "react";
import { joinGroup, type JoinState } from "@/actions/join-group";

export function JoinForm({ uuid }: { uuid?: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinGroup, null);

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
        <label htmlFor="display_name">Your name</label>
        <input id="display_name" name="display_name" maxLength={40} required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="Optional" />
      </div>
      {state?.error ? <p className="err">{state.error}</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
