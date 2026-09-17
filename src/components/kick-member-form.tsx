"use client";

import { useActionState, useEffect, useState } from "react";
import { kickMember, type KickMemberState } from "@/actions/kick-member";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import {
  PEOPLE_REMOVE,
  PEOPLE_REMOVE_CONFIRM,
  PEOPLE_REMOVE_CONFIRM_ACTION,
  PEOPLE_REMOVED,
} from "@/lib/copy";
import { KICK_CONFIRM_VALUE } from "@/lib/manage";

export function KickMemberForm({
  groupId,
  memberId,
}: {
  groupId: string;
  memberId: string;
}) {
  const [state, action, pending] = useActionState<KickMemberState, FormData>(kickMember, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state?.ok) setConfirming(false);
  }, [state]);

  if (state?.ok) {
    return <span className="tiny muted">{PEOPLE_REMOVED}</span>;
  }

  if (!confirming) {
    return (
      <span className="listitem__end">
        {state && !state.ok ? <span className="err">{state.error}</span> : null}
        <button
          className="btn btn--quiet"
          type="button"
          aria-label={PEOPLE_REMOVE}
          onClick={() => setConfirming(true)}
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <form action={action} className="kick-confirm" onSubmit={markBusy} aria-busy={busy || undefined}>
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="confirm" value={KICK_CONFIRM_VALUE} />
      <p className="small muted">{PEOPLE_REMOVE_CONFIRM}</p>
      {state && !state.ok ? <p className="err">{state.error}</p> : null}
      <div className="row">
        <button
          className="btn btn--secondary"
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
        <PendingSubmitButton className="btn btn--danger" busy={busy} pendingLabel="Removing…">
          {PEOPLE_REMOVE_CONFIRM_ACTION}
        </PendingSubmitButton>
      </div>
    </form>
  );
}
