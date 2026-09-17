"use client";

import Link from "next/link";
import { EmailInput, PasswordInput } from "@/components/auth-fields";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { FORGOT_PASSWORD_LINK, LANDING_SIGN_IN } from "@/lib/copy";
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
        <EmailInput disabled={busy} />
        <PasswordInput autoComplete="current-password" disabled={busy} />
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
