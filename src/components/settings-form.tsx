"use client";

import { useActionState } from "react";
import { updateSchedule, type SettingsState } from "@/actions/settings";
import type { Group } from "@/lib/types";

export function SettingsForm({ group }: { group: Group }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateSchedule,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      <h1 className="font-serif text-4xl leading-tight">Settings</h1>
      <p className="text-muted">Days of the month. America/Chicago.</p>
      <input type="hidden" name="groupId" value={group.id} />
      <div className="field">
        <label htmlFor="submit_start_day">Submit opens</label>
        <input
          id="submit_start_day"
          name="submit_start_day"
          type="number"
          min={1}
          max={28}
          required
          defaultValue={group.submit_start_day}
        />
      </div>
      <div className="field">
        <label htmlFor="submit_end_day">Submit closes</label>
        <input
          id="submit_end_day"
          name="submit_end_day"
          type="number"
          min={1}
          max={28}
          required
          defaultValue={group.submit_end_day}
        />
      </div>
      <div className="field">
        <label htmlFor="email_day">Email capsule</label>
        <input
          id="email_day"
          name="email_day"
          type="number"
          min={1}
          max={28}
          required
          defaultValue={group.email_day}
        />
      </div>
      {state?.error ? <p className="err">{state.error}</p> : null}
      {state?.ok ? <p>Saved.</p> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
