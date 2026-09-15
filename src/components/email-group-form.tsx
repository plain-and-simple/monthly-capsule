"use client";

import { useActionState, useState } from "react";
import { emailGroupNow, type CycleEmailState } from "@/actions/cycle";
import { MutationToast } from "@/components/app-toast";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { CYCLE_EMAIL_LATER, CYCLE_SEND_AGAIN, CYCLE_SEND_AGAIN_HINT } from "@/lib/copy";
import {
  CONFIRM_RESEND_VALUE,
  CYCLE_ALREADY_SENT,
  CYCLE_EMAIL_TIMEOUT,
} from "@/lib/cycle";
import { EMAIL_PENDING_GUARD_MS } from "@/lib/email-policy";

export function EmailGroupForm({
  groupId,
  yearMonth,
  version,
  alreadySent = false,
}: {
  groupId: string;
  yearMonth: string;
  version?: number;
  alreadySent?: boolean;
}) {
  const [state, action, pending] = useActionState<CycleEmailState, FormData>(emailGroupNow, null);
  return (
    <OwnerEmailSubmit
      groupId={groupId}
      yearMonth={yearMonth}
      version={version}
      alreadySent={alreadySent}
      action={action}
      state={state}
      pending={pending}
      label={CYCLE_EMAIL_LATER}
      buttonClass="btn btn--secondary"
    />
  );
}

export function OwnerEmailSubmit({
  groupId,
  yearMonth,
  version,
  alreadySent = false,
  action,
  state,
  pending,
  label,
  buttonClass,
}: {
  groupId: string;
  yearMonth: string;
  version?: number;
  alreadySent?: boolean;
  action: (payload: FormData) => void;
  state: CycleEmailState;
  pending: boolean;
  label: string;
  buttonClass: string;
}) {
  const { busy, markBusy, stuck } = useInstantBusy(pending, EMAIL_PENDING_GUARD_MS);
  const [confirming, setConfirming] = useState(false);
  const needsConfirm = alreadySent || state?.error === CYCLE_ALREADY_SENT;
  const showConfirmGate = needsConfirm && !confirming && !state?.ok;
  const error = state?.error || (stuck ? CYCLE_EMAIL_TIMEOUT : undefined);

  if (showConfirmGate) {
    return (
      <div className="stack stack--tight">
        {alreadySent ? <p className="muted small">Already emailed.</p> : null}
        {state?.error ? <p className="err">{state.error}</p> : null}
        <button className={buttonClass} type="button" onClick={() => setConfirming(true)}>
          {CYCLE_SEND_AGAIN}
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="stack stack--tight"
      onSubmit={markBusy}
      aria-busy={busy || undefined}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="yearMonth" value={yearMonth} />
      {version != null ? <input type="hidden" name="version" value={String(version)} /> : null}
      {needsConfirm ? <input type="hidden" name="confirmResend" value={CONFIRM_RESEND_VALUE} /> : null}
      {needsConfirm ? <p className="muted small">{CYCLE_SEND_AGAIN_HINT}</p> : null}
      {error ? <p className="err">{error}</p> : null}
      <MutationToast pending={busy} ok={state?.ok} message={state?.ok ? state.message : null} />
      <PendingSubmitButton
        className={buttonClass}
        busy={busy}
        ignorePending={stuck}
        pendingLabel="Sending…"
      >
        {needsConfirm ? CYCLE_SEND_AGAIN : label}
      </PendingSubmitButton>
      {busy ? (
        <p className="btn-note" role="status">
          Working… sending email.
        </p>
      ) : null}
    </form>
  );
}
