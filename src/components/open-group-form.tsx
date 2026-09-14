"use client";

import Link from "next/link";
import { useState } from "react";
import { initials } from "@/lib/group-status";
import { OPEN_GROUP_PATH, type OpenGroupUiDecision } from "@/lib/session-policy";

function OpenGroupRow({
  name,
  roleLabel,
  meta,
  status,
  busy,
}: {
  name: string;
  roleLabel: string;
  meta: string;
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
    </>
  );
}

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
  const [clicked, setClicked] = useState(false);

  return (
    <button
      className="listitem"
      type="submit"
      disabled={clicked}
      aria-busy={clicked || undefined}
      onClick={() => setClicked(true)}
    >
      <OpenGroupRow
        name={name}
        roleLabel={roleLabel}
        meta={meta}
        status={status}
        busy={clicked}
      />
    </button>
  );
}

function OpenGroupLink({
  href,
  name,
  roleLabel,
  meta,
  status,
}: {
  href: string;
  name: string;
  roleLabel: string;
  meta: string;
  status: string;
}) {
  const [clicked, setClicked] = useState(false);

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
      <OpenGroupRow
        name={name}
        roleLabel={roleLabel}
        meta={meta}
        status={status}
        busy={clicked}
      />
    </Link>
  );
}

export function OpenGroupForm({
  groupId,
  open,
  name,
  roleLabel,
  meta,
  status,
}: {
  groupId: string;
  open: OpenGroupUiDecision;
  name: string;
  roleLabel: string;
  meta: string;
  status: string;
}) {
  if (open.action === "link") {
    return (
      <OpenGroupLink
        href={open.path}
        name={name}
        roleLabel={roleLabel}
        meta={meta}
        status={status}
      />
    );
  }

  return (
    <form action={OPEN_GROUP_PATH} method="post">
      <input type="hidden" name="groupId" value={groupId} />
      <OpenGroupButton name={name} roleLabel={roleLabel} meta={meta} status={status} />
    </form>
  );
}
