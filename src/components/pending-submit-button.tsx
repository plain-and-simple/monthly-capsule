"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function useInstantBusy(pending: boolean) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (pending) setHeld(true);
    else setHeld(false);
  }, [pending]);

  return {
    busy: held || pending,
    markBusy: () => setHeld(true),
  };
}

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel: string;
  busy?: boolean;
  children: ReactNode;
};

export function PendingSubmitButton({
  pendingLabel,
  busy: busyProp = false,
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
  const busy = pending || clicked || busyProp;
  const isSubmitter =
    clicked ||
    name == null ||
    Boolean(pending && data && data.get(name) === String(value ?? ""));

  useEffect(() => {
    if (!pending && !busyProp) setClicked(false);
  }, [pending, busyProp]);

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
