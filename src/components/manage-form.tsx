"use client";

import Link from "next/link";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { ACCOUNT_PASSWORD_LABEL, FORGOT_PASSWORD_LINK, LANDING_SIGN_IN } from "@/lib/copy";
import { LOGIN_PATH } from "@/lib/session-policy";

export function ManageForm({
  next,
  error,
  returnTo = "/",
}: {
  next?: string | null;
  error?: string | null;
  returnTo?: string;
}) {
  const { busy, markBusy } = useInstantBusy(false);

  return (
    <form
      action={LOGIN_PATH}
      method="post"
      className="stack"
      onSubmit={markBusy}
      aria-busy={busy || undefined}
    >
      <h2>{LANDING_SIGN_IN}</h2>
      <input type="hidden" name="return" value={returnTo} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="field">
          <span className="field__label">Email</span>
          <input className="input" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="field">
          <span className="field__label">{ACCOUNT_PASSWORD_LABEL}</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
          />
        </label>
      </div>
      <p className="small">
        <Link href="/forgot">{FORGOT_PASSWORD_LINK}</Link>
      </p>
      {error ? <p className="err">{error}</p> : null}
      <PendingSubmitButton
        className="btn btn--primary btn--block btn--lg"
        busy={busy}
        pendingLabel="Signing in…"
      >
        {LANDING_SIGN_IN}
      </PendingSubmitButton>
    </form>
  );
}
