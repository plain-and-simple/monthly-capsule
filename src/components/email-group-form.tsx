"use client";

import { useActionState } from "react";
import { emailGroupNow, type CycleEmailState } from "@/actions/cycle";
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

  return (
    <form action={action} className="card stack stack--tight">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="yearMonth" value={yearMonth} />
      {version != null ? <input type="hidden" name="version" value={String(version)} /> : null}
      <div className="stack stack--tight">
        <p className="eyebrow">Owner</p>
        <p className="small">
          Email this capsule to everyone who has an address. People without email are skipped.
        </p>
      </div>
      {state?.error ? <p className="err">{state.error}</p> : null}
      {state?.ok ? <p className="small">{state.message}</p> : null}
      <button className="btn btn--secondary" type="submit" disabled={pending}>
        {pending ? "Sending…" : CYCLE_EMAIL_LATER}
      </button>
    </form>
  );
}
