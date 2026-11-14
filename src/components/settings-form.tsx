"use client";

import { useActionState, useState } from "react";
import { updateGroupName, updateSchedule, type SettingsState } from "@/actions/settings";
import { DaySelect } from "@/components/day-select";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { ThemeForm } from "@/components/theme-form";
import {
  CREATE_SCHEDULE_HINT,
  OPEN_EMAIL_CHECKBOX,
  OPEN_EMAIL_NOTE,
  REMINDER_EMAIL_CHECKBOX,
  REMINDER_EMAIL_NOTE,
} from "@/lib/copy";
import {
  SEND_CYCLE_EMAIL_VALUE,
  SEND_OPEN_EMAIL_FIELD,
  SEND_REMINDER_EMAIL_FIELD,
  scheduleCatchUpPrompts,
  type CycleEmailSentMap,
} from "@/lib/cycle-email";
import { scheduleFormDays, type ScheduleDays } from "@/lib/schedule";
import type { Group } from "@/lib/types";

export function SettingsForm({
  group,
  closedYearMonths,
  cycleEmailSent,
}: {
  group: Group;
  closedYearMonths: readonly string[];
  cycleEmailSent: CycleEmailSentMap;
}) {
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
  const prompts = scheduleCatchUpPrompts({
    group: {
      ...group,
      submit_start_day: days.submit_start_day,
      submit_end_day: days.submit_end_day,
      email_day: days.email_day,
    },
    closedYearMonths,
    sent: cycleEmailSent,
  });

  function setDay(field: keyof ScheduleDays, value: string) {
    setDraft({ ...days, [field]: Number(value) });
  }

  return (
    <div className="stack stack--loose">
      <ThemeForm groupId={group.id} theme={group.capsule_theme} />

      <hr className="rule" />

      <section className="stack">
        <h2>Schedule</h2>
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
          <p className="formnote">{CREATE_SCHEDULE_HINT}</p>
          {prompts.promptOpen ? (
            <div className="stack stack--tight" key={`open-${days.submit_start_day}-${days.submit_end_day}`}>
              <p className="formnote">{OPEN_EMAIL_NOTE}</p>
              <label className="check">
                <input
                  type="checkbox"
                  name={SEND_OPEN_EMAIL_FIELD}
                  value={SEND_CYCLE_EMAIL_VALUE}
                />
                <span>{OPEN_EMAIL_CHECKBOX}</span>
              </label>
            </div>
          ) : null}
          {prompts.promptReminder ? (
            <div
              className="stack stack--tight"
              key={`reminder-${days.submit_start_day}-${days.submit_end_day}`}
            >
              <p className="formnote">{REMINDER_EMAIL_NOTE}</p>
              <label className="check">
                <input
                  type="checkbox"
                  name={SEND_REMINDER_EMAIL_FIELD}
                  value={SEND_CYCLE_EMAIL_VALUE}
                />
                <span>{REMINDER_EMAIL_CHECKBOX}</span>
              </label>
            </div>
          ) : null}
          {scheduleState?.error ? <p className="err">{scheduleState.error}</p> : null}
          {scheduleState?.ok ? <p className="small">Saved.</p> : null}
          {scheduleState?.notice ? <p className="formnote">{scheduleState.notice}</p> : null}
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
