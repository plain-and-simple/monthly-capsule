"use client";

import { CopyButton } from "@/components/copy-button";
import { RegenPinForm } from "@/components/regen-pin-form";
import { INVITE_HELPER } from "@/lib/copy";
import { inviteMessage } from "@/lib/manage";

export function InvitePanel({
  shareUrl,
  groupName,
  groupId,
  isOwner,
}: {
  shareUrl: string;
  groupName: string;
  groupId: string;
  isOwner: boolean;
}) {
  const message = inviteMessage(shareUrl, "", groupName);

  return (
    <div className="stack stack--loose">
      <div className="stack stack--tight">
        <h1>Invite someone to {groupName}</h1>
        <p className="muted small">They need both the link and the Group PIN.</p>
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

          <div className="stack stack--tight">
            <span className="field__label">Message to send</span>
            <textarea
              className="textarea"
              readOnly
              aria-label="Message to send"
              value={message}
              style={{ minHeight: "7rem", fontFamily: "var(--font-sans)", fontSize: "0.92rem" }}
            />
            <CopyButton text={message} label="Copy message" className="btn btn--primary btn--block" />
          </div>
        </div>
      </div>

      {isOwner ? (
        <div className="card">
          <RegenPinForm groupId={groupId} shareUrl={shareUrl} groupName={groupName} />
          <p className="tiny muted" style={{ marginTop: "0.75rem" }}>
            Anyone you already invited needs the new PIN.
          </p>
        </div>
      ) : (
        <p className="tiny muted">{INVITE_HELPER}</p>
      )}
    </div>
  );
}
