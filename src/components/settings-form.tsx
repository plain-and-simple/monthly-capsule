"use client";

import { useActionState } from "react";
import { updateGroupName, updateSchedule, type SettingsState } from "@/actions/settings";
import type { Group } from "@/lib/types";

export function SettingsForm({ group }: { group: Group }) {
  const [scheduleState, scheduleAction, schedulePending] = useActionState<SettingsState, FormData>(
    updateSchedule,
    null,
  );
  const [nameState, nameAction, namePending] = useActionState<SettingsState, FormData>(
    updateGroupName,
    null,
  );

  return (
    <div className="stack stack--loose">
      <section className="stack">
        <h2>Cycle</h2>
        <form action={scheduleAction} className="stack">
          <input type="hidden" name="groupId" value={group.id} />
          <div className="field-inline">
            <span className="small muted">Submit opens</span>
            <input
              className="input"
              name="submit_start_day"
              type="number"
              min={1}
              max={28}
              required
              defaultValue={group.submit_start_day}
              aria-label="Submit opens"
            />
          </div>
          <div className="field-inline">
            <span className="small muted">Submit closes</span>
            <input
              className="input"
              name="submit_end_day"
              type="number"
              min={1}
              max={28}
              required
              defaultValue={group.submit_end_day}
              aria-label="Submit closes"
            />
          </div>
          <div className="field-inline">
            <span className="small muted">Email capsule</span>
            <input
              className="input"
              name="email_day"
              type="number"
              min={1}
              max={28}
              required
              defaultValue={group.email_day}
              aria-label="Email capsule"
            />
          </div>
          <p className="formnote">Days of the month. America/Chicago.</p>
          {scheduleState?.error ? <p className="err">{scheduleState.error}</p> : null}
          {scheduleState?.ok ? <p className="small">Saved.</p> : null}
          <div>
            <button className="btn btn--secondary" type="submit" disabled={schedulePending}>
              {schedulePending ? "Saving…" : "Save cycle"}
            </button>
          </div>
        </form>
      </section>

      <hr className="rule" />

      <section className="stack">
        <h2>Group name</h2>
        <form action={nameAction} className="stack">
          <input type="hidden" name="groupId" value={group.id} />
          <label className="field">
            <span className="field__label">Name</span>
            <input className="input" name="name" maxLength={40} defaultValue={group.name} />
          </label>
          {nameState?.error ? <p className="err">{nameState.error}</p> : null}
          {nameState?.ok ? <p className="small">Saved.</p> : null}
          <div>
            <button className="btn btn--secondary" type="submit" disabled={namePending}>
              {namePending ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
