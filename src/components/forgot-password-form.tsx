"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordReset,
  type RequestPasswordResetState,
} from "@/actions/request-password-reset";
import { EmailInput } from "@/components/auth-fields";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import {
  FORGOT_PASSWORD_HEADING,
  FORGOT_PASSWORD_LEDE,
  FORGOT_PASSWORD_SUBMIT,
  LANDING_SIGN_IN,
} from "@/lib/copy";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<RequestPasswordResetState, FormData>(
    requestPasswordReset,
    null,
  );
  const { busy, markBusy } = useInstantBusy(pending);

  if (state && "ok" in state && state.ok) {
    return (
      <div className="stack">
        <h2>{FORGOT_PASSWORD_HEADING}</h2>
        <p>{state.message}</p>
        <p className="muted small">Check that inbox, including spam. The link works once and expires in an hour.</p>
        <Link className="backlink" href="/">
          ← {LANDING_SIGN_IN}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
      <div className="stack stack--tight">
        <h2>{FORGOT_PASSWORD_HEADING}</h2>
        <p className="muted small">{FORGOT_PASSWORD_LEDE}</p>
      </div>
      <EmailInput />
      {state && "error" in state ? <p className="err">{state.error}</p> : null}
      <PendingSubmitButton
        className="btn btn--primary btn--block btn--lg"
        busy={busy}
        pendingLabel="Sending…"
      >
        {FORGOT_PASSWORD_SUBMIT}
      </PendingSubmitButton>
      <Link className="backlink" href="/">
        ← {LANDING_SIGN_IN}
      </Link>
    </form>
  );
}
