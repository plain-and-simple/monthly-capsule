"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createGroup, type CreateState } from "@/actions/create-group";
import { CopyButton } from "@/components/copy-button";

export function CreateForm({ signedInAs }: { signedInAs?: string | null }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createGroup, null);
  const [studioCode, setStudioCode] = useState("");

  if (state?.ok) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-4xl leading-tight">Join with this link and PIN</h1>
        <p className="text-muted">PIN is shown once. It cannot be recovered.</p>
        <div className="space-y-4 rounded-xl border border-rule bg-card p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Join link</p>
            <p className="mt-1 break-all font-serif text-lg">{state.shareUrl}</p>
            <div className="mt-2">
              <CopyButton text={state.shareUrl} label="Copy link" />
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">PIN</p>
            <p className="mt-1 font-serif text-3xl tracking-[0.2em]">{state.pin}</p>
            <div className="mt-2">
              <CopyButton text={state.pin} label="Copy PIN" />
            </div>
          </div>
        </div>
        <Link className="btn" href={`/g/${state.groupId}`}>
          Continue
        </Link>
      </div>
    );
  }

  if (!studioCode) {
    return (
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const next = String(new FormData(event.currentTarget).get("studio_code") ?? "").trim();
          if (next) setStudioCode(next);
        }}
      >
        <h1 className="font-serif text-4xl leading-tight">Create Capsule Group</h1>
        <p className="text-muted">Studio code first.</p>
        <div className="field">
          <label htmlFor="studio_code">Studio code</label>
          <input id="studio_code" name="studio_code" required autoComplete="off" />
        </div>
        <button className="btn" type="submit">
          Continue
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <h1 className="font-serif text-4xl leading-tight">Create Capsule Group</h1>
      <p className="text-muted">
        {signedInAs
          ? `Creating as ${signedInAs}. Your account will own this group.`
          : "Preferred name, email, and password. Your account will own this group."}
      </p>
      <input type="hidden" name="studio_code" value={studioCode} />
      <div className="field">
        <label htmlFor="name">Group name</label>
        <input id="name" name="name" maxLength={40} placeholder="Optional" />
      </div>
      {signedInAs ? null : (
        <>
          <div className="field">
            <label htmlFor="preferred_name">Preferred name</label>
            <input id="preferred_name" name="preferred_name" maxLength={40} required />
          </div>
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
      )}
      {state && !state.ok ? <p className="err">{state.error}</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
