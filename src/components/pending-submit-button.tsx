"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CLIENT_PENDING_GUARD_MS } from "@/lib/pending-ui";

export function useInstantBusy(pending: boolean, stuckMs = CLIENT_PENDING_GUARD_MS) {
  const [held, setHeld] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (pending) {
      setHeld(true);
      setStuck(false);
    } else {
      setHeld(false);
    }
  }, [pending]);

  useEffect(() => {
    if (stuck) return;
    if (!held && !pending) return;
    const timer = window.setTimeout(() => {
      setHeld(false);
      setStuck(true);
    }, stuckMs);
    return () => window.clearTimeout(timer);
  }, [held, pending, stuckMs, stuck]);

  return {
    busy: stuck ? false : held || pending,
    stuck,
    markBusy: () => {
      setStuck(false);
      setHeld(true);
    },
  };
}

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel: string;
  busy?: boolean;
  ignorePending?: boolean;
  children: ReactNode;
};

export function PendingSubmitButton({
  pendingLabel,
  busy: busyProp = false,
  ignorePending = false,
  children,
  className,
  disabled,
  onClick,
  name,
  value,
  ...props
}: PendingSubmitButtonProps) {
  const { pending, data } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const rawBusy = pending || clicked || busyProp;
  const busy = ignorePending || timedOut ? false : rawBusy;
  const isSubmitter =
    clicked ||
    name == null ||
    Boolean(pending && data && data.get(name) === String(value ?? ""));

  useEffect(() => {
    if (!rawBusy) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), CLIENT_PENDING_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [rawBusy]);

  useEffect(() => {
    if (ignorePending || timedOut || (!pending && !busyProp)) setClicked(false);
  }, [pending, busyProp, ignorePending, timedOut]);

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      className={className}
      name={name}
      value={value}
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        setClicked(true);
      }}
    >
      {busy && isSubmitter ? pendingLabel : children}
    </button>
  );
}
