"use client";

import { useActionState, useState } from "react";
import {
  emailGroupNow,
  forceCloseCompile,
  forceOpenSubmit,
  skipGroupEmail,
  type CycleEmailState,
  type ForceCloseState,
  type ForceOpenState,
} from "@/actions/cycle";
import {
  CYCLE_CLOSE_COMPILE,
  CYCLE_EMAIL_LATER,
  CYCLE_NOT_NOW,
  CYCLE_OPEN_EARLY,
  CYCLE_SECTION,
  CYCLE_SEND,
} from "@/lib/copy";
import { CYCLE_EMAIL_PROMPT, CYCLE_OPENED } from "@/lib/cycle";
import { FORCE_CLOSE_CONFIRM_VALUE } from "@/lib/manage";
import { monthLabel } from "@/lib/schedule";

export function CycleForm({
  groupId,
  submitOpen,
  unsentYearMonth,
  thisMonthLabel,
  writtenPhrase,
}: {
  groupId: string;
  submitOpen: boolean;
  unsentYearMonth: string | null;
  thisMonthLabel?: string;
  writtenPhrase?: string;
}) {
  const [openState, openAction, openPending] = useActionState<ForceOpenState, FormData>(
    forceOpenSubmit,
    null,
  );
  const [closeState, closeAction, closePending] = useActionState<ForceCloseState, FormData>(
    forceCloseCompile,
    null,
  );
  const [emailState, emailAction, emailPending] = useActionState<CycleEmailState, FormData>(
    emailGroupNow,
    null,
  );
  const [skipState, skipAction, skipPending] = useActionState<CycleEmailState, FormData>(
    skipGroupEmail,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  const askYearMonth = closeState?.askEmail ? closeState.yearMonth : null;
  const askedAndDone = Boolean(emailState?.ok || skipState?.ok);
  const showEmailPrompt = Boolean(askYearMonth && !askedAndDone);
  const laterYearMonth = showEmailPrompt ? null : unsentYearMonth;

  if (showEmailPrompt && askYearMonth) {
    return (
      <div className="scrim">
        <div className="dialog">
          <div className="stack">
            <div className="stack stack--tight">
              <p className="eyebrow">Made just now</p>
              <h2 className="serif" style={{ fontSize: "1.3rem" }}>
                The {monthLabel(askYearMonth)} capsule is ready
              </h2>
              <p className="muted small">{CYCLE_EMAIL_PROMPT}</p>
            </div>
            {emailState?.error ? <p className="err">{emailState.error}</p> : null}
            {skipState?.error ? <p className="err">{skipState.error}</p> : null}
            <form action={emailAction}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              <button className="btn btn--primary btn--block" type="submit" disabled={emailPending}>
                {emailPending ? "Sending…" : CYCLE_SEND}
              </button>
            </form>
            <form action={skipAction}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              <button className="btn btn--quiet btn--block" type="submit" disabled={skipPending}>
                {skipPending ? "Saving…" : CYCLE_NOT_NOW}
              </button>
            </form>
            <p className="btn-note">If not now, Settings will keep offering it until you do.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack stack--loose">
      {laterYearMonth ? (
        <div className="card">
          <div className="stack">
            <div className="stack stack--tight">
              <p className="eyebrow">Waiting on you</p>
              <h2>The {monthLabel(laterYearMonth)} capsule was never emailed</h2>
              <p className="muted small">Everyone can read it on the site.</p>
            </div>
            <div className="row">
              <form action={emailAction}>
                <input type="hidden" name="groupId" value={groupId} />
                <input type="hidden" name="yearMonth" value={laterYearMonth} />
                {emailState?.error && !showEmailPrompt ? <p className="err">{emailState.error}</p> : null}
                {emailState?.ok && !showEmailPrompt ? <p>{emailState.message}</p> : null}
                <button className="btn btn--primary" type="submit" disabled={emailPending}>
                  {emailPending ? "Sending…" : CYCLE_EMAIL_LATER}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <section className="stack">
        <h2>This month</h2>
        <div className="panel">
          <div className="stack">
            <p className="small">
              {thisMonthLabel ? <span>{thisMonthLabel} is </span> : null}
              <b>{submitOpen ? "open" : "closed"}</b>
              {writtenPhrase ? `. ${writtenPhrase}.` : "."}
            </p>
            <div className="row">
              {confirming && !closeState?.ok ? (
                <form action={closeAction} className="stack">
                  <p className="muted small">Closes submit and makes the capsule.</p>
                  <input type="hidden" name="groupId" value={groupId} />
                  <input type="hidden" name="confirm" value={FORCE_CLOSE_CONFIRM_VALUE} />
                  {closeState?.error ? <p className="err">{closeState.error}</p> : null}
                  <div className="row">
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={closePending}
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </button>
                    <button className="btn btn--danger" type="submit" disabled={closePending}>
                      {closePending ? "Closing…" : CYCLE_CLOSE_COMPILE}
                    </button>
                  </div>
                </form>
              ) : (
                <button className="btn btn--secondary" type="button" onClick={() => setConfirming(true)}>
                  {CYCLE_CLOSE_COMPILE}
                </button>
              )}
              {submitOpen ? (
                <span className="btn btn--quiet" aria-disabled="true">
                  {CYCLE_OPEN_EARLY}
                </span>
              ) : (
                <form action={openAction}>
                  <input type="hidden" name="groupId" value={groupId} />
                  {openState?.error ? <p className="err">{openState.error}</p> : null}
                  {openState?.ok ? <p>{CYCLE_OPENED}</p> : null}
                  <button className="btn btn--secondary" type="submit" disabled={openPending}>
                    {openPending ? "Opening…" : CYCLE_OPEN_EARLY}
                  </button>
                </form>
              )}
            </div>
            {submitOpen ? (
              <p className="muted tiny">Closing early is final for this month.</p>
            ) : openState?.error ? (
              <p className="err">{openState.error}</p>
            ) : null}
            {closeState?.ok && closeState.message ? <p className="small">{closeState.message}</p> : null}
          </div>
        </div>
      </section>
      <p className="tiny muted">{CYCLE_SECTION}</p>
    </div>
  );
}
