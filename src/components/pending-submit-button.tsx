"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CLIENT_PENDING_GUARD_MS, submitBusyDisablesControl } from "@/lib/pending-ui";

export function useInstantBusy(pending: boolean, hungMs = CLIENT_PENDING_GUARD_MS) {
  const [held, setHeld] = useState(false);
  const sawPending = useRef(false);

  useEffect(() => {
    if (pending) {
      sawPending.current = true;
      setHeld(true);
      return;
    }
    if (sawPending.current) {
      sawPending.current = false;
      setHeld(false);
    }
  }, [pending]);

  useEffect(() => {
    if (!held || pending) return;
    const timer = window.setTimeout(() => setHeld(false), hungMs);
    return () => window.clearTimeout(timer);
  }, [held, pending, hungMs]);

  return {
    busy: held || pending,
    stuck: false,
    markBusy: () => setHeld(true),
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
  onKeyDown,
  name,
  value,
  ...props
}: PendingSubmitButtonProps) {
  const { pending, data } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const visualBusy = pending || busyProp;
  const actionPending = pending && !ignorePending;
  const busy = ignorePending ? false : visualBusy || clicked;
  const isSubmitter =
    clicked ||
    name == null ||
    Boolean(pending && data && data.get(name) === String(value ?? ""));

  useEffect(() => {
    if (!visualBusy) setClicked(false);
  }, [visualBusy]);

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      className={className}
      name={name}
      value={value}
      disabled={disabled || submitBusyDisablesControl(actionPending)}
      aria-busy={busy || undefined}
      aria-disabled={busy || disabled || undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (busy && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
        }
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (busy) {
          event.preventDefault();
          return;
        }
        setClicked(true);
      }}
    >
      {busy && isSubmitter ? pendingLabel : children}
    </button>
  );
}
