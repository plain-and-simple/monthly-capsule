"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function useInstantBusy(pending: boolean, stuckMs?: number) {
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
    const wait = pending ? stuckMs : 2_500;
    if (!wait) return;
    const timer = window.setTimeout(() => {
      setHeld(false);
      if (pending) setStuck(true);
    }, wait);
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
  const busy = ignorePending ? false : pending || clicked || busyProp;
  const isSubmitter =
    clicked ||
    name == null ||
    Boolean(pending && data && data.get(name) === String(value ?? ""));

  useEffect(() => {
    if (ignorePending || (!pending && !busyProp)) setClicked(false);
  }, [pending, busyProp, ignorePending]);

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
