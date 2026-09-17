"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { initials } from "@/lib/group-status";
import { CLIENT_PENDING_GUARD_MS } from "@/lib/pending-ui";
import { OPEN_GROUP_PATH, type OpenGroupUiDecision } from "@/lib/session-policy";

function OpenGroupRow({
  name,
  roleLabel,
  status,
  busy,
}: {
  name: string;
  roleLabel: string;
  status: string;
  busy: boolean;
}) {
  return (
    <>
      <span className="avatar avatar--lg">{initials(name)}</span>
      <span className="listitem__body">
        <span className="listitem__heading">
          <span className="listitem__title">{name}</span>
          <span className="badge">{roleLabel}</span>
        </span>
      </span>
      <span className="listitem__end">
        {busy ? "Opening…" : <span className="badge">{status}</span>}
      </span>
    </>
  );
}

function OpenGroupLink({
  href,
  name,
  roleLabel,
  status,
}: {
  href: string;
  name: string;
  roleLabel: string;
  status: string;
}) {
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (!clicked) return;
    const timer = window.setTimeout(() => setClicked(false), CLIENT_PENDING_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [clicked]);

  return (
    <Link
      className="listitem"
      href={href}
      prefetch={false}
      aria-busy={clicked || undefined}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        setClicked(true);
      }}
    >
      <OpenGroupRow name={name} roleLabel={roleLabel} status={status} busy={clicked} />
    </Link>
  );
}

export function OpenGroupForm({
  groupId,
  open,
  name,
  roleLabel,
  status,
}: {
  groupId: string;
  open: OpenGroupUiDecision;
  name: string;
  roleLabel: string;
  status: string;
}) {
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    if (!clicked) return;
    const timer = window.setTimeout(() => setClicked(false), CLIENT_PENDING_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [clicked]);

  if (open.action === "link") {
    return (
      <OpenGroupLink href={open.path} name={name} roleLabel={roleLabel} status={status} />
    );
  }

  return (
    <form
      action={OPEN_GROUP_PATH}
      method="post"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (clicked) {
          event.preventDefault();
          return;
        }
        setClicked(true);
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <button className="listitem" type="submit" aria-busy={clicked || undefined}>
        <OpenGroupRow name={name} roleLabel={roleLabel} status={status} busy={clicked} />
      </button>
    </form>
  );
}
