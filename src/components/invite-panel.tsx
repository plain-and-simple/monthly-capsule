"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { INVITE_HELPER, JOIN_PIN_LABEL } from "@/lib/copy";
import { inviteMessage } from "@/lib/manage";

export function InvitePanel({ shareUrl, groupName }: { shareUrl: string; groupName: string }) {
  const [pin, setPin] = useState("");
  const message = inviteMessage(shareUrl, pin, groupName);

  return (
    <div className="stack stack--loose">
      <div className="stack stack--tight">
        <h1>Invite someone to {groupName}</h1>
        <p className="muted small">They need both the link and the PIN.</p>
      </div>

      <div className="card">
        <div className="stack">
          <div className="stack stack--tight">
            <span className="field__label">Invite link</span>
            <div className="copyrow">
              <input className="input" readOnly value={shareUrl} />
              <CopyButton text={shareUrl} label="Copy" />
            </div>
          </div>

          <label className="field">
            <span className="field__label">{JOIN_PIN_LABEL}</span>
            <input
              className="input input--pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              placeholder="XXXXXX"
              spellCheck={false}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <span className="field__hint">
              Type the PIN you already know. We never show it back to you — not even here.
            </span>
          </label>

          <div className="stack stack--tight">
            <span className="field__label">Message to send</span>
            <textarea
              className="textarea"
              readOnly
              value={message}
              style={{ minHeight: "7rem", fontFamily: "var(--font-sans)", fontSize: "0.92rem" }}
            />
            <CopyButton text={message} label="Copy message" className="btn btn--primary btn--block" />
          </div>
        </div>
      </div>

      <p className="tiny muted">{INVITE_HELPER}</p>
      <div className="panel">
        <p className="small muted">
          Forgotten the PIN? Anyone in the group knows it. Only the owner can make a new one, in
          Settings.
        </p>
      </div>
    </div>
  );
}
