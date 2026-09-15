"use client";

import Link from "next/link";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { JOIN_PIN_LABEL, PREFERRED_NAME_LABEL, groupDisplayName } from "@/lib/copy";
import { JOIN_GROUP_PATH } from "@/lib/session-policy";

export function JoinForm({
  uuid,
  signedInAs,
  groupName,
  memberCount,
  error,
}: {
  uuid?: string;
  signedInAs: string;
  groupName?: string | null;
  memberCount?: number;
  error?: string | null;
}) {
  const { busy, markBusy } = useInstantBusy(false);
  const title = groupName ? `Join ${groupDisplayName(groupName)}` : "Join";
  const returnTo = uuid ? `/join/${uuid}` : "/join";

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
          <form
            action={JOIN_GROUP_PATH}
            method="post"
            className="stack"
            onSubmit={markBusy}
            aria-busy={busy || undefined}
          >
            <input type="hidden" name="return" value={returnTo} />
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

            {error ? <p className="err">{error}</p> : null}
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
