"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SIGN_OUT } from "@/lib/copy";
import { CLIENT_PENDING_GUARD_MS } from "@/lib/pending-ui";
import { LOGOUT_PATH } from "@/lib/session-policy";

/**
 * Native POST like Open group. Keep the submit control enabled so the 303
 * logout request is not canceled mid-click.
 */
export function SignOutButton() {
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (!clicked) return;
    const timer = window.setTimeout(() => setClicked(false), CLIENT_PENDING_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [clicked]);

  return (
    <form
      action={LOGOUT_PATH}
      method="post"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (clicked) {
          event.preventDefault();
          return;
        }
        setClicked(true);
      }}
    >
      <button className="signout" type="submit" aria-busy={clicked || undefined}>
        {clicked ? "Signing out…" : SIGN_OUT}
      </button>
    </form>
  );
}
