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
import { OwnerEmailSubmit } from "@/components/email-group-form";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
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
import { capsuleTitle } from "@/lib/month-version";
import { monthLabel } from "@/lib/schedule";

export function CycleForm({
  groupId,
  submitOpen,
  unsent,
  thisMonthLabel,
  writtenPhrase,
}: {
  groupId: string;
  submitOpen: boolean;
  unsent: { yearMonth: string; version: number } | null;
  thisMonthLabel?: string;
  writtenPhrase?: string;
}) {
  const [openState, openAction, openPending] = useActionState<ForceOpenState, FormData>(
    forceOpenSubmit,
    null,
  );
  const { busy: openBusy, markBusy: markOpenBusy } = useInstantBusy(openPending);
  const [closeState, closeAction, closePending] = useActionState<ForceCloseState, FormData>(
    forceCloseCompile,
    null,
  );
  const { busy: closeBusy, markBusy: markCloseBusy } = useInstantBusy(closePending);
  const [emailState, emailAction, emailPending] = useActionState<CycleEmailState, FormData>(
    emailGroupNow,
    null,
  );
  const [skipState, skipAction, skipPending] = useActionState<CycleEmailState, FormData>(
    skipGroupEmail,
    null,
  );
  const { busy: skipBusy, markBusy: markSkipBusy } = useInstantBusy(skipPending);
  const [confirming, setConfirming] = useState(false);

  const askYearMonth = closeState?.askEmail ? closeState.yearMonth : null;
  const askVersion = closeState?.askEmail ? closeState.version : null;
  const askedAndDone = Boolean(emailState?.ok || skipState?.ok);
  const showEmailPrompt = Boolean(askYearMonth && !askedAndDone);
  const later = showEmailPrompt ? null : unsent;

  if (showEmailPrompt && askYearMonth) {
    return (
      <div className="scrim">
        <div className="dialog">
          <div className="stack">
            <div className="stack stack--tight">
              <p className="eyebrow">Made just now</p>
              <h2 className="serif" style={{ fontSize: "1.3rem" }}>
                The {capsuleTitle(monthLabel(askYearMonth), askVersion ?? 1)} capsule is ready
              </h2>
              <p className="muted small">{CYCLE_EMAIL_PROMPT}</p>
            </div>
            {skipState?.error ? <p className="err">{skipState.error}</p> : null}
            <OwnerEmailSubmit
              groupId={groupId}
              yearMonth={askYearMonth}
              version={askVersion ?? undefined}
              action={emailAction}
              state={emailState}
              pending={emailPending}
              label={CYCLE_SEND}
              buttonClass="btn btn--primary btn--block"
            />
            <form action={skipAction} onSubmit={markSkipBusy} aria-busy={skipBusy || undefined}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              {askVersion != null ? (
                <input type="hidden" name="version" value={String(askVersion)} />
              ) : null}
              <PendingSubmitButton
                className="btn btn--quiet btn--block"
                busy={skipBusy}
                pendingLabel="Saving…"
              >
                {CYCLE_NOT_NOW}
              </PendingSubmitButton>
            </form>
            <p className="btn-note">If not now, Settings will keep offering it until you do.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack stack--loose">
      {later ? (
        <div className="card">
          <div className="stack">
            <div className="stack stack--tight">
              <p className="eyebrow">Waiting on you</p>
              <h2>
                The {capsuleTitle(monthLabel(later.yearMonth), later.version)} capsule was never
                emailed
              </h2>
              <p className="muted small">Everyone can read it on the site.</p>
            </div>
            <div className="row">
              <OwnerEmailSubmit
                groupId={groupId}
                yearMonth={later.yearMonth}
                version={later.version}
                action={emailAction}
                state={emailState}
                pending={emailPending}
                label={CYCLE_EMAIL_LATER}
                buttonClass="btn btn--primary"
              />
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
                <form
                  action={closeAction}
                  className="stack"
                  onSubmit={markCloseBusy}
                  aria-busy={closeBusy || undefined}
                >
                  <p className="muted small">Closes submit and makes the capsule.</p>
                  <input type="hidden" name="groupId" value={groupId} />
                  <input type="hidden" name="confirm" value={FORCE_CLOSE_CONFIRM_VALUE} />
                  {closeState?.error ? <p className="err">{closeState.error}</p> : null}
                  <div className="row">
                    <button
                      className="btn btn--secondary"
                      type="button"
                      disabled={closeBusy}
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </button>
                    <PendingSubmitButton
                      className="btn btn--danger"
                      busy={closeBusy}
                      pendingLabel="Working…"
                    >
                      {CYCLE_CLOSE_COMPILE}
                    </PendingSubmitButton>
                  </div>
                  {closeBusy ? (
                    <p className="btn-note" role="status">
                      Working… making the capsule.
                    </p>
                  ) : null}
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
                <form action={openAction} onSubmit={markOpenBusy} aria-busy={openBusy || undefined}>
                  <input type="hidden" name="groupId" value={groupId} />
                  {openState?.error ? <p className="err">{openState.error}</p> : null}
                  {openState?.ok ? <p>{CYCLE_OPENED}</p> : null}
                  <PendingSubmitButton
                    className="btn btn--secondary"
                    busy={openBusy}
                    pendingLabel="Opening…"
                  >
                    {CYCLE_OPEN_EARLY}
                  </PendingSubmitButton>
                </form>
              )}
            </div>
            {submitOpen ? (
              <p className="muted tiny">
                Closing makes this version of the capsule. You can open again for a new version.
              </p>
            ) : openState?.error ? (
              <p className="err">{openState.error}</p>
            ) : null}
            {closeState?.ok && closeState.message ? <p className="small">{closeState.message}</p> : null}
            {emailState?.error && !later ? <p className="err">{emailState.error}</p> : null}
          </div>
        </div>
      </section>
      <p className="tiny muted">{CYCLE_SECTION}</p>
    </div>
  );
}
