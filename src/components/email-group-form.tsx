"use client";

import { useActionState } from "react";
import { emailGroupNow, type CycleEmailState } from "@/actions/cycle";
import { CYCLE_EMAIL_LATER } from "@/lib/copy";

export function EmailGroupForm({ groupId, yearMonth }: { groupId: string; yearMonth: string }) {
  const [state, action, pending] = useActionState<CycleEmailState, FormData>(emailGroupNow, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="yearMonth" value={yearMonth} />
      {state?.error ? <p className="err">{state.error}</p> : null}
      {state?.ok ? <p>{state.message}</p> : null}
      <button className="btn btn-ghost" type="submit" disabled={pending}>
        {pending ? "Sending…" : CYCLE_EMAIL_LATER}
      </button>
    </form>
  );
}
