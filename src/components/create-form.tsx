"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createGroup, type CreateState } from "@/actions/create-group";
import { CopyButton } from "@/components/copy-button";
import {
  ACCOUNT_PASSWORD_LABEL,
  PREFERRED_NAME_LABEL,
  createSuccessHero,
} from "@/lib/copy";

export function CreateForm({ signedInAs }: { signedInAs?: string | null }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createGroup, null);
  const [studioCode, setStudioCode] = useState("");

  if (state?.ok) {
    const hero = createSuccessHero({ name: state.groupName, pin: state.pin });
    return (
      <div className="create-success space-y-8">
        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-medium leading-tight">{hero.groupName}</h1>
          <p className="create-success-pin">{hero.pin}</p>
        </div>
        <div className="space-y-3">
          <CopyButton text={hero.pin} label={hero.copyLabel} />
          <p className="text-muted">{hero.hint}</p>
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
        <h1 className="font-serif text-4xl font-medium leading-tight">Create Capsule Group</h1>
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
      <h1 className="font-serif text-4xl font-medium leading-tight">Create Capsule Group</h1>
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
            <label htmlFor="preferred_name">{PREFERRED_NAME_LABEL}</label>
            <input id="preferred_name" name="preferred_name" maxLength={40} required />
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
