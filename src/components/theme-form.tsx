"use client";

import { useActionState, useState } from "react";
import { updateCapsuleTheme, type SettingsState } from "@/actions/settings";
import { PendingSubmitButton, useInstantBusy } from "@/components/pending-submit-button";
import {
  CAPSULE_THEME_CATALOG,
  themeFormValue,
  type CapsuleTheme,
} from "@/lib/capsule-theme";
import { CAPSULE_THEME_HINT, CAPSULE_THEME_SAVE, CAPSULE_THEME_SECTION } from "@/lib/copy";

export function ThemeForm({
  groupId,
  theme,
}: {
  groupId: string;
  theme: CapsuleTheme | string | null | undefined;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateCapsuleTheme, null);
  const { busy, markBusy } = useInstantBusy(pending);
  const [draft, setDraft] = useState<CapsuleTheme | null>(null);
  const selected = themeFormValue(theme, state, draft);

  return (
    <section className="stack">
      <h2>{CAPSULE_THEME_SECTION}</h2>
      <p className="formnote">{CAPSULE_THEME_HINT}</p>
      <form action={action} className="stack" onSubmit={markBusy} aria-busy={busy || undefined}>
        <input type="hidden" name="groupId" value={groupId} />
        <div className="theme-picks" role="radiogroup" aria-label={CAPSULE_THEME_SECTION}>
          {CAPSULE_THEME_CATALOG.map((option) => (
            <label key={option.id} className="theme-pick">
              <input
                type="radio"
                name="capsule_theme"
                value={option.id}
                checked={option.id === selected}
                onChange={() => setDraft(option.id)}
              />
              <span className="theme-pick__swatch" data-theme={option.id} aria-hidden="true">
                {option.colors.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="theme-pick__name">{option.name}</span>
            </label>
          ))}
        </div>
        {state?.error ? <p className="err">{state.error}</p> : null}
        {state?.ok ? <p className="small">Saved.</p> : null}
        <div>
          <PendingSubmitButton className="btn btn--secondary" busy={busy} pendingLabel="Saving…">
            {CAPSULE_THEME_SAVE}
          </PendingSubmitButton>
        </div>
      </form>
    </section>
  );
}
