"use client";

import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import { STUDIO_PATH } from "@/lib/session-policy";

export function StudioGateForm({ error }: { error?: string | null }) {
  const { busy, markBusy } = useInstantBusy(false);

  return (
    <form
      action={STUDIO_PATH}
      method="post"
      className="stack"
      onSubmit={markBusy}
      aria-busy={busy || undefined}
    >
      <div className="stack stack--tight">
        <h1>Studio code</h1>
        <p className="muted small">Internal counts for builders. Same code as creating a group.</p>
      </div>
      <label className="field">
        <span className="field__label">Code</span>
        <input
          className="input input--code"
          name="studio_code"
          required
          autoComplete="off"
          spellCheck={false}
        />
        <span className="field__hint">Case does not matter.</span>
      </label>
      {error ? <p className="err">{error}</p> : null}
      <PendingSubmitButton className="btn btn--primary btn--block" busy={busy} pendingLabel="Opening…">
        Continue
      </PendingSubmitButton>
    </form>
  );
}
