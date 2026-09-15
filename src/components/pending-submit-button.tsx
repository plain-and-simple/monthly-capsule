"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { flushSync, useFormStatus } from "react-dom";
import { CLIENT_PENDING_GUARD_MS, pendingGuardRemainingMs } from "@/lib/pending-ui";

export function useInstantBusy(pending: boolean, stuckMs = CLIENT_PENDING_GUARD_MS) {
  const [held, setHeld] = useState(false);
  const [stuck, setStuck] = useState(false);
  const startedAtRef = useRef<number | null>(null);

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
    const active = held || pending;
    if (!active) {
      startedAtRef.current = null;
      return;
    }
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }
    const remaining = pendingGuardRemainingMs(startedAtRef.current, Date.now(), stuckMs);
    const timer = window.setTimeout(() => {
      flushSync(() => {
        setHeld(false);
        setStuck(true);
      });
    }, remaining);
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
  const startedAtRef = useRef<number | null>(null);
  const rawBusy = pending || clicked || busyProp;
  const busy = ignorePending || timedOut ? false : rawBusy;
  const isSubmitter =
    clicked ||
    name == null ||
    Boolean(pending && data && data.get(name) === String(value ?? ""));

  useEffect(() => {
    if (!rawBusy) {
      startedAtRef.current = null;
      setTimedOut(false);
      return;
    }
    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }
    const remaining = pendingGuardRemainingMs(startedAtRef.current, Date.now());
    const timer = window.setTimeout(() => {
      flushSync(() => setTimedOut(true));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [rawBusy]);

  useEffect(() => {
    if (ignorePending || timedOut) setClicked(false);
  }, [ignorePending, timedOut]);

  return (
    <button
      {...props}
      type={props.type ?? "submit"}
      className={className}
      name={name}
      value={value}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || disabled || undefined}
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
