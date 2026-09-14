"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { openManagedGroup } from "@/actions/open-group";
import { initials } from "@/lib/group-status";

function OpenGroupButton({
  name,
  roleLabel,
  meta,
  status,
}: {
  name: string;
  roleLabel: string;
  meta: string;
  status: string;
}) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const busy = pending || clicked;

  return (
    <button
      className="listitem"
      type="submit"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => setClicked(true)}
    >
      <span className="avatar avatar--lg">{initials(name)}</span>
      <span className="listitem__body">
        <span className="listitem__heading">
          <span className="listitem__title">{name}</span>
          <span className="badge">{roleLabel}</span>
        </span>
        <span className="listitem__meta">{meta}</span>
      </span>
      <span className="listitem__end">
        {busy ? (
          "Opening…"
        ) : (
          <span className={status === "Open" ? "badge badge--open" : "badge"}>
            {status === "Open" ? <span className="dot" /> : null}
            {status}
          </span>
        )}
      </span>
    </button>
  );
}

export function OpenGroupForm({
  groupId,
  name,
  roleLabel,
  meta,
  status,
}: {
  groupId: string;
  name: string;
  roleLabel: string;
  meta: string;
  status: string;
}) {
  return (
    <form action={openManagedGroup}>
      <input type="hidden" name="groupId" value={groupId} />
      <OpenGroupButton name={name} roleLabel={roleLabel} meta={meta} status={status} />
    </form>
  );
}
