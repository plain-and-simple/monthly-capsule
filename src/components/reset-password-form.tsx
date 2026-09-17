"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  completePasswordReset,
  type CompletePasswordResetState,
} from "@/actions/complete-password-reset";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { PasswordInput } from "@/components/auth-fields";
import {
  FORGOT_PASSWORD_LINK,
  RESET_PASSWORD_HEADING,
  RESET_PASSWORD_LEDE,
  RESET_PASSWORD_SUBMIT,
} from "@/lib/copy";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<CompletePasswordResetState, FormData>(
    completePasswordReset,
    null,
  );
  const { busy, markBusy } = useInstantBusy(pending);

  return (
    <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
      <div className="stack stack--tight">
        <h2>{RESET_PASSWORD_HEADING}</h2>
        <p className="muted small">{RESET_PASSWORD_LEDE}</p>
      </div>
      <input type="hidden" name="token" value={token} />
      <PasswordInput autoComplete="new-password" />
      {state?.error ? <p className="err">{state.error}</p> : null}
      <PendingSubmitButton
        className="btn btn--primary btn--block btn--lg"
        busy={busy}
        pendingLabel="Saving…"
      >
        {RESET_PASSWORD_SUBMIT}
      </PendingSubmitButton>
      <p className="small muted">
        Link already used? <Link href="/forgot">{FORGOT_PASSWORD_LINK}</Link>
      </p>
    </form>
  );
}
