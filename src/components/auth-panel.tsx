"use client";

import { useState } from "react";
import { ManageForm } from "@/components/manage-form";
import { SignUpForm } from "@/components/sign-up-form";
import { LANDING_HAVE_LOGIN, LANDING_SIGN_UP } from "@/lib/copy";

export function AuthPanel({
  next,
  error,
  returnTo = "/",
  signInFirst = false,
}: {
  next?: string | null;
  error?: string | null;
  returnTo?: string;
  /** Home: sign in is the page. Create an account is one step away. */
  signInFirst?: boolean;
}) {
  const [creating, setCreating] = useState(false);

  if (signInFirst) {
    return (
      <div className="stack">
        <div className="card card--pad-lg">
          {creating ? (
            <SignUpForm next={next} returnTo={returnTo} />
          ) : (
            <ManageForm next={next} error={error} returnTo={returnTo} />
          )}
        </div>
        <button type="button" className="btn btn--quiet" onClick={() => setCreating((open) => !open)}>
          {creating ? LANDING_HAVE_LOGIN : LANDING_SIGN_UP}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-split">
      <div className="card card--pad-lg">
        <ManageForm next={next} error={error} returnTo={returnTo} />
      </div>
      <div className="card card--pad-lg">
        <SignUpForm next={next} returnTo={returnTo} />
      </div>
    </div>
  );
}
