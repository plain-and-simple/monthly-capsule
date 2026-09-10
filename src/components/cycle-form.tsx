"use client";

import Link from "next/link";
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
  GROUP_PRIMARY_VIEW,
} from "@/lib/copy";
import { CYCLE_EMAIL_PROMPT, CYCLE_OPENED } from "@/lib/cycle";
import { FORCE_CLOSE_CONFIRM_VALUE } from "@/lib/manage";
import { capsuleHref, capsuleTitle } from "@/lib/month-version";
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
  const askVersion = closeState?.askEmail ? closeState.version : null;
  const askedAndDone = Boolean(emailState?.ok || skipState?.ok);
  const showEmailPrompt = Boolean(askYearMonth && !askedAndDone);
  const later = showEmailPrompt ? null : unsent;

  if (showEmailPrompt && askYearMonth) {
    const editionLabel = capsuleTitle(monthLabel(askYearMonth), askVersion ?? 1);
    return (
      <div className="scrim">
        <div className="dialog">
          <div className="stack">
            <div className="stack stack--tight">
              <p className="eyebrow">Made just now</p>
              <h2 className="serif" style={{ fontSize: "1.3rem" }}>
                The {editionLabel} capsule is ready
              </h2>
              <p className="muted small">
                {writtenPhrase ? `${writtenPhrase}. ` : ""}
                {CYCLE_EMAIL_PROMPT}
              </p>
            </div>
            {emailState?.error ? <p className="err">{emailState.error}</p> : null}
            {emailState?.ok ? <p className="small">{emailState.message}</p> : null}
            {skipState?.error ? <p className="err">{skipState.error}</p> : null}
            <Link
              className="btn btn--secondary btn--block"
              href={capsuleHref(groupId, askYearMonth, askVersion ?? 1)}
            >
              {GROUP_PRIMARY_VIEW}
            </Link>
            <form action={emailAction}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              {askVersion != null ? (
                <input type="hidden" name="version" value={String(askVersion)} />
              ) : null}
              <button className="btn btn--primary btn--block" type="submit" disabled={emailPending}>
                {emailPending ? "Sending…" : CYCLE_SEND}
              </button>
            </form>
            <form action={skipAction}>
              <input type="hidden" name="groupId" value={groupId} />
              <input type="hidden" name="yearMonth" value={askYearMonth} />
              {askVersion != null ? (
                <input type="hidden" name="version" value={String(askVersion)} />
              ) : null}
              <button className="btn btn--quiet btn--block" type="submit" disabled={skipPending}>
                {skipPending ? "Saving…" : CYCLE_NOT_NOW}
              </button>
            </form>
            <p className="btn-note">
              Email goes to everyone with an address. If not now, Settings will keep offering it until
              you do.
            </p>
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
              <p className="muted small">
                Everyone can read it on the site. Send only reaches people who saved an email.
              </p>
            </div>
            <div className="row">
              <form action={emailAction}>
                <input type="hidden" name="groupId" value={groupId} />
                <input type="hidden" name="yearMonth" value={later.yearMonth} />
                <input type="hidden" name="version" value={String(later.version)} />
                {emailState?.error && !showEmailPrompt ? <p className="err">{emailState.error}</p> : null}
                {emailState?.ok && !showEmailPrompt ? <p>{emailState.message}</p> : null}
                <button className="btn btn--primary" type="submit" disabled={emailPending}>
                  {emailPending ? "Sending…" : CYCLE_EMAIL_LATER}
                </button>
              </form>
              <Link
                className="btn btn--secondary"
                href={capsuleHref(groupId, later.yearMonth, later.version)}
              >
                {GROUP_PRIMARY_VIEW}
              </Link>
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
              {!submitOpen ? (
                <span className="btn btn--quiet" aria-disabled="true">
                  {CYCLE_CLOSE_COMPILE}
                </span>
              ) : confirming && !closeState?.ok ? (
                <form action={closeAction} className="stack">
                  <p className="muted small">
                    Closing early is final for this version. Letters freeze, and the capsule is made
                    now.
                  </p>
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
              <p className="muted tiny">
                Closing makes this version of the capsule. You can open again for a new version.
              </p>
            ) : openState?.error ? (
              <p className="err">{openState.error}</p>
            ) : (
              <p className="muted tiny">Open again to start a new version of this month.</p>
            )}
            {closeState?.ok && closeState.message ? <p className="small">{closeState.message}</p> : null}
            {emailState?.ok ? <p className="small">{emailState.message}</p> : null}
            {emailState?.error && !later ? <p className="err">{emailState.error}</p> : null}
          </div>
        </div>
      </section>
      <p className="tiny muted">{CYCLE_SECTION}</p>
    </div>
  );
}
