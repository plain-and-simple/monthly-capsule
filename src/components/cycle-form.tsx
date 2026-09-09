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
import { CYCLE_ALREADY_OPEN, CYCLE_EMAIL_PROMPT, CYCLE_OPENED } from "@/lib/cycle";
import { FORCE_CLOSE_CONFIRM_VALUE } from "@/lib/manage";

export function CycleForm({
  groupId,
  submitOpen,
  unsentYearMonth,
}: {
  groupId: string;
  submitOpen: boolean;
  unsentYearMonth: string | null;
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

  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl leading-tight">{CYCLE_SECTION}</h2>

      {submitOpen ? (
        <p className="text-muted">{CYCLE_ALREADY_OPEN}</p>
      ) : (
        <form action={openAction}>
          <input type="hidden" name="groupId" value={groupId} />
          {openState?.error ? <p className="err">{openState.error}</p> : null}
          {openState?.ok ? <p>{CYCLE_OPENED}</p> : null}
          <button className="btn btn-ghost" type="submit" disabled={openPending}>
            {openPending ? "Opening…" : CYCLE_OPEN_EARLY}
          </button>
        </form>
      )}

      {showEmailPrompt && askYearMonth ? (
        <div className="space-y-3">
          <p>{CYCLE_EMAIL_PROMPT}</p>
          {emailState?.error ? <p className="err">{emailState.error}</p> : null}
          {skipState?.error ? <p className="err">{skipState.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <form action={emailAction}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              <button className="btn" type="submit" disabled={emailPending}>
                {emailPending ? "Sending…" : CYCLE_SEND}
              </button>
            </form>
            <form action={skipAction}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              <button className="btn btn-ghost" type="submit" disabled={skipPending}>
                {skipPending ? "Saving…" : CYCLE_NOT_NOW}
              </button>
            </form>
          </div>
        </div>
      ) : confirming && !closeState?.ok ? (
        <form action={closeAction} className="space-y-3">
          <p className="text-muted">Closes submit and makes the capsule.</p>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="confirm" value={FORCE_CLOSE_CONFIRM_VALUE} />
          {closeState?.error ? <p className="err">{closeState.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={closePending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button className="btn btn-danger" type="submit" disabled={closePending}>
              {closePending ? "Closing…" : CYCLE_CLOSE_COMPILE}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {closeState?.error ? <p className="err">{closeState.error}</p> : null}
          {closeState?.ok && closeState.message ? <p>{closeState.message}</p> : null}
          {emailState?.ok ? <p>{emailState.message}</p> : null}
          {skipState?.ok ? <p>{skipState.message}</p> : null}
          <button className="btn btn-danger" type="button" onClick={() => setConfirming(true)}>
            {CYCLE_CLOSE_COMPILE}
          </button>
        </div>
      )}

      {laterYearMonth ? (
        <form action={emailAction}>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="yearMonth" value={laterYearMonth} />
          {emailState?.error && !showEmailPrompt ? <p className="err">{emailState.error}</p> : null}
          {emailState?.ok && !showEmailPrompt ? <p>{emailState.message}</p> : null}
          <button className="btn btn-ghost" type="submit" disabled={emailPending}>
            {emailPending ? "Sending…" : CYCLE_EMAIL_LATER}
          </button>
        </form>
      ) : null}
    </section>
  );
}
