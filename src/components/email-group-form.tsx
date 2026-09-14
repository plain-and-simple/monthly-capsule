"use client";

import { useActionState } from "react";
import { emailGroupNow, type CycleEmailState } from "@/actions/cycle";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { CYCLE_EMAIL_LATER } from "@/lib/copy";

export function EmailGroupForm({
  groupId,
  yearMonth,
  version,
}: {
  groupId: string;
  yearMonth: string;
  version?: number;
}) {
  const [state, action, pending] = useActionState<CycleEmailState, FormData>(emailGroupNow, null);
  const { busy, markBusy } = useInstantBusy(pending);

  return (
    <form
      action={action}
      className="stack stack--tight"
      onSubmit={markBusy}
      aria-busy={busy || undefined}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="yearMonth" value={yearMonth} />
      {version != null ? <input type="hidden" name="version" value={String(version)} /> : null}
      {state?.error ? <p className="err">{state.error}</p> : null}
      {state?.ok ? <p>{state.message}</p> : null}
      <PendingSubmitButton className="btn btn--secondary" busy={busy} pendingLabel="Sending…">
        {CYCLE_EMAIL_LATER}
      </PendingSubmitButton>
      {busy ? (
        <p className="btn-note" role="status">
          Working… sending email.
        </p>
      ) : null}
    </form>
  );
}
