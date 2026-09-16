"use client";

import { useActionState, useState } from "react";
import { updateGroupName, updateSchedule, type SettingsState } from "@/actions/settings";
import { DaySelect } from "@/components/day-select";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { ThemeForm } from "@/components/theme-form";
import { scheduleFormDays, type ScheduleDays } from "@/lib/schedule";
import type { Group } from "@/lib/types";

export function SettingsForm({ group }: { group: Group }) {
  const [scheduleState, scheduleAction, schedulePending] = useActionState<SettingsState, FormData>(
    updateSchedule,
    null,
  );
  const { busy: scheduleBusy, markBusy: markScheduleBusy } = useInstantBusy(schedulePending);
  const [nameState, nameAction, namePending] = useActionState<SettingsState, FormData>(
    updateGroupName,
    null,
  );
  const { busy: nameBusy, markBusy: markNameBusy } = useInstantBusy(namePending);
  const [draft, setDraft] = useState<ScheduleDays | null>(null);
  const days = scheduleFormDays(group, scheduleState, draft);

  function setDay(field: keyof ScheduleDays, value: string) {
    setDraft({ ...days, [field]: Number(value) });
  }

  return (
    <div className="stack stack--loose">
      <ThemeForm groupId={group.id} theme={group.capsule_theme} />

      <hr className="rule" />

      <section className="stack">
        <h2>Cycle</h2>
        <form
          action={scheduleAction}
          className="stack"
          onSubmit={markScheduleBusy}
          aria-busy={scheduleBusy || undefined}
        >
          <input type="hidden" name="groupId" value={group.id} />
          <div className="field-inline">
            <span className="small muted">Submit opens</span>
            <DaySelect
              name="submit_start_day"
              value={days.submit_start_day}
              onChange={(event) => setDay("submit_start_day", event.target.value)}
              label="Submit opens"
              variant="open"
            />
          </div>
          <div className="field-inline">
            <span className="small muted">Submit closes</span>
            <DaySelect
              name="submit_end_day"
              value={days.submit_end_day}
              onChange={(event) => setDay("submit_end_day", event.target.value)}
              label="Submit closes"
            />
          </div>
          <div className="field-inline">
            <span className="small muted">Email capsule</span>
            <DaySelect
              name="email_day"
              value={days.email_day}
              onChange={(event) => setDay("email_day", event.target.value)}
              label="Email capsule"
            />
          </div>
          <p className="formnote">Days of the month. America/Chicago.</p>
          {scheduleState?.error ? <p className="err">{scheduleState.error}</p> : null}
          {scheduleState?.ok ? <p className="small">Saved.</p> : null}
          <div>
            <PendingSubmitButton
              className="btn btn--secondary"
              busy={scheduleBusy}
              pendingLabel="Saving…"
            >
              Save cycle
            </PendingSubmitButton>
          </div>
        </form>
      </section>

      <hr className="rule" />

      <section className="stack">
        <h2>Group name</h2>
        <form
          action={nameAction}
          className="stack"
          onSubmit={markNameBusy}
          aria-busy={nameBusy || undefined}
        >
          <input type="hidden" name="groupId" value={group.id} />
          <label className="field">
            <span className="field__label">Name</span>
            <input className="input" name="name" maxLength={40} defaultValue={group.name} />
          </label>
          {nameState?.error ? <p className="err">{nameState.error}</p> : null}
          {nameState?.ok ? <p className="small">Saved.</p> : null}
          <div>
            <PendingSubmitButton
              className="btn btn--secondary"
              busy={nameBusy}
              pendingLabel="Saving…"
            >
              Save name
            </PendingSubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
