"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { INVITE_HELPER, JOIN_PIN_LABEL } from "@/lib/copy";
import { inviteShareText } from "@/lib/manage";

export function InvitePanel({ shareUrl }: { shareUrl: string }) {
  const [pin, setPin] = useState("");
  const shareText = inviteShareText(shareUrl, pin);

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-4xl font-medium leading-tight">Invite</h1>
      <p className="text-muted">{INVITE_HELPER}</p>
      <div className="space-y-4 rounded-xl border border-rule bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Join link</p>
          <p className="mt-1 break-all font-serif text-lg">{shareUrl}</p>
          <div className="mt-2">
            <CopyButton text={shareUrl} label="Copy link" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="typed_pin">{JOIN_PIN_LABEL}</label>
          <input
            id="typed_pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <p className="text-sm text-muted">Type it if you have it.</p>
          {pin ? (
            <div className="mt-2">
              <CopyButton text={pin} label="Copy PIN" />
            </div>
          ) : null}
        </div>
        <div>
          <CopyButton text={shareText} label="Copy share text" />
        </div>
      </div>
    </div>
  );
}
