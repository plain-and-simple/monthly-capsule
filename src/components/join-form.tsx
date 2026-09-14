"use client";

import { useActionState } from "react";
import Link from "next/link";
import { joinGroup, type JoinState } from "@/actions/join-group";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { JOIN_PIN_LABEL, PREFERRED_NAME_LABEL, groupDisplayName } from "@/lib/copy";

export function JoinForm({
  uuid,
  signedInAs,
  groupName,
  memberCount,
}: {
  uuid?: string;
  signedInAs: string;
  groupName?: string | null;
  memberCount?: number;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinGroup, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const title = groupName ? `Join ${groupDisplayName(groupName)}` : "Join";

  return (
    <div className="wrap wrap--narrow">
      <div className="stack stack--loose">
        <div className="stack stack--tight">
          <p className="eyebrow">You have been invited</p>
          <h1>{title}</h1>
          <p className="lede">
            {memberCount
              ? `${memberCount} ${memberCount === 1 ? "person" : "people"} so far. One letter each, once a month.`
              : "One letter each, once a month."}
          </p>
        </div>

        <div className="card card--pad-lg">
          <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
            {uuid ? (
              <input type="hidden" name="uuid" value={uuid} />
            ) : (
              <label className="field">
                <span className="field__label">Join link or group ID</span>
                <input className="input" name="uuid" required autoComplete="off" />
              </label>
            )}
            <label className="field">
              <span className="field__label">{JOIN_PIN_LABEL}</span>
              <input
                className="input input--pin"
                name="pin"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="XXXXXX"
                spellCheck={false}
              />
              <span className="field__hint">From whoever sent you the link.</span>
            </label>

            <hr className="rule" />

            <label className="field">
              <span className="field__label">{PREFERRED_NAME_LABEL}</span>
              <input
                className="input"
                name="preferred_name"
                maxLength={40}
                required
                defaultValue={signedInAs}
                autoComplete="nickname"
              />
              <span className="field__hint">
                {groupName ? `How ${groupDisplayName(groupName)} will see you.` : "How the group will see you."}
              </span>
            </label>

            <p className="small muted">Signed in as {signedInAs}. This group will appear in Manage.</p>

            {state?.error ? <p className="err">{state.error}</p> : null}
            <PendingSubmitButton
              className="btn btn--primary btn--block btn--lg"
              busy={busy}
              pendingLabel="Joining…"
            >
              {title}
            </PendingSubmitButton>
          </form>
        </div>

        <p className="center small muted">
          Already in this group? <Link href="/manage">Open Manage</Link>
        </p>
      </div>
    </div>
  );
}
