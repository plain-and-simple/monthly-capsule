"use client";

import { EmailInput, PasswordInput } from "@/components/auth-fields";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { LANDING_SIGN_UP, PREFERRED_NAME_LABEL } from "@/lib/copy";
import { SIGNUP_PATH } from "@/lib/session-policy";

export function SignUpForm({
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
      action={SIGNUP_PATH}
      method="post"
      className="stack"
      onSubmit={markBusy}
      aria-busy={busy || undefined}
    >
      <h2>{LANDING_SIGN_UP}</h2>
      <input type="hidden" name="return" value={returnTo} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="field">
          <span className="field__label">{PREFERRED_NAME_LABEL}</span>
          <input
            className="input"
            name="preferred_name"
            required
            maxLength={40}
            autoComplete="nickname"
          />
        </label>
        <EmailInput />
        <PasswordInput autoComplete="new-password" />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <PendingSubmitButton
        className="btn btn--primary btn--block btn--lg"
        busy={busy}
        pendingLabel="Creating…"
      >
        {LANDING_SIGN_UP}
      </PendingSubmitButton>
    </form>
  );
}
