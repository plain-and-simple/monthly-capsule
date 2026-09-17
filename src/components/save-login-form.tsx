"use client";

import { EmailInput, PasswordInput } from "@/components/auth-fields";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { SAVE_LOGIN_REQUIRED_HEADING, SAVE_LOGIN_REQUIRED_HINT } from "@/lib/copy";
import { SAVE_LOGIN_PATH } from "@/lib/session-policy";

export function SaveLoginForm({
  groupId,
  next,
  error,
}: {
  groupId: string;
  next?: string;
  error?: string | null;
}) {
  const { busy, markBusy } = useInstantBusy(false);

  return (
    <form
      action={SAVE_LOGIN_PATH}
      method="post"
      className="card stack"
      onSubmit={markBusy}
      aria-busy={busy || undefined}
    >
      <div className="stack stack--tight">
        <h2>{SAVE_LOGIN_REQUIRED_HEADING}</h2>
        <p className="muted small">{SAVE_LOGIN_REQUIRED_HINT}</p>
      </div>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="return" value={next ?? `/g/${groupId}`} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <EmailInput />
      <PasswordInput autoComplete="current-password" />
      {error ? <p className="err">{error}</p> : null}
      <PendingSubmitButton className="btn btn--secondary" busy={busy} pendingLabel="Saving…">
        Save login
      </PendingSubmitButton>
    </form>
  );
}
